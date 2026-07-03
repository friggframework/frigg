jest.mock('../../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { DeleteIntegrationForUser } = require('../../use-cases/delete-integration-for-user');
const { TestIntegrationRepository } = require('../doubles/test-integration-repository');
const { DummyIntegration } = require('../doubles/dummy-integration-class');

// Records the integration's in-memory status at the moment ON_DELETE fires, so
// a test can prove IN_DELETION was set before any teardown ran.
let capturedStatusAtDelete;
class StatusCapturingDeleteIntegration extends DummyIntegration {
    async send(event, data) {
        if (event === 'ON_DELETE') {
            capturedStatusAtDelete = this.status;
        }
        return super.send(event, data);
    }
}

// Simulates a teardown that throws (e.g. a webhook deregistration failure).
class FailingDeleteIntegration extends DummyIntegration {
    async send(event, data) {
        if (event === 'ON_DELETE') {
            capturedStatusAtDelete = this.status;
            throw new Error('teardown failed');
        }
        return super.send(event, data);
    }
}

describe('DeleteIntegrationForUser Use-Case', () => {
    let integrationRepository;
    let useCase;

    beforeEach(() => {
        integrationRepository = new TestIntegrationRepository();
        useCase = new DeleteIntegrationForUser({
            integrationRepository,
            integrationClasses: [DummyIntegration],
        });
    });

    describe('happy path', () => {
        it('deletes integration successfully', async () => {
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy' });

            await useCase.execute(record.id, 'user-1');

            const found = await integrationRepository.findIntegrationById(record.id);
            expect(found).toBeNull();
        });

        it('tracks delete operation', async () => {
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy' });
            integrationRepository.clearHistory();

            await useCase.execute(record.id, 'user-1');

            const history = integrationRepository.getOperationHistory();
            const deleteOperation = history.find(op => op.operation === 'delete');
            expect(deleteOperation).toEqual({
                operation: 'delete',
                id: record.id,
                existed: true,
                success: true
            });
        });

        it('deletes integration with multiple entities', async () => {
            const record = await integrationRepository.createIntegration(['e1', 'e2', 'e3'], 'user-1', { type: 'dummy' });

            await useCase.execute(record.id, 'user-1');

            const found = await integrationRepository.findIntegrationById(record.id);
            expect(found).toBeNull();
        });
    });

    describe('error cases', () => {
        it('throws error when integration not found', async () => {
            const nonExistentId = 'non-existent-id';

            await expect(useCase.execute(nonExistentId, 'user-1'))
                .rejects
                .toThrow(`Integration with id of ${nonExistentId} does not exist`);
        });

        it('throws error when user does not own integration', async () => {
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy' });

            await expect(useCase.execute(record.id, 'different-user'))
                .rejects
                .toThrow(`Integration ${record.id} does not belong to User different-user`);
        });

        it('throws error when integration class not found', async () => {
            const useCaseWithoutClasses = new DeleteIntegrationForUser({
                integrationRepository,
                integrationClasses: [],
            });

            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy' });

            await expect(useCaseWithoutClasses.execute(record.id, 'user-1'))
                .rejects
                .toThrow();
        });

        it('tracks failed delete operation for non-existent integration', async () => {
            const nonExistentId = 'non-existent-id';
            integrationRepository.clearHistory();

            try {
                await useCase.execute(nonExistentId, 'user-1');
            } catch (error) {
                const history = integrationRepository.getOperationHistory();
                const findOperation = history.find(op => op.operation === 'findById');
                expect(findOperation).toEqual({
                    operation: 'findById',
                    id: nonExistentId,
                    found: false
                });
            }
        });
    });

    describe('resilience to onDelete failures', () => {
        it('leaves the row IN_DELETION and undeleted when onDelete throws, recording why', async () => {
            class ThrowingOnDeleteIntegration extends DummyIntegration {
                static Definition = {
                    ...DummyIntegration.Definition,
                    name: 'throwing-on-delete',
                };

                async onDelete(params) {
                    throw new Error('webhook deregistration failed');
                }
            }

            const useCaseWithThrowingIntegration = new DeleteIntegrationForUser({
                integrationRepository,
                integrationClasses: [ThrowingOnDeleteIntegration],
            });
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'throwing-on-delete' });

            await expect(
                useCaseWithThrowingIntegration.execute(record.id, 'user-1')
            ).rejects.toThrow('webhook deregistration failed');

            const found = await integrationRepository.findIntegrationById(record.id);
            expect(found).not.toBeNull();
        });

        it('leaves the row IN_DELETION and undeleted when onDelete rejects with a non-Error value', async () => {
            class NullRejectingOnDeleteIntegration extends DummyIntegration {
                static Definition = {
                    ...DummyIntegration.Definition,
                    name: 'null-rejecting-on-delete',
                };

                async onDelete(params) {
                    throw null;
                }
            }

            const useCaseWithNullRejectingIntegration = new DeleteIntegrationForUser({
                integrationRepository,
                integrationClasses: [NullRejectingOnDeleteIntegration],
            });
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'null-rejecting-on-delete' });

            await expect(
                useCaseWithNullRejectingIntegration.execute(record.id, 'user-1')
            ).rejects.toBeNull();

            const found = await integrationRepository.findIntegrationById(record.id);
            expect(found).not.toBeNull();
        });

        it('records an error message on the integration when teardown fails', async () => {
            let capturedMessagesExecute;
            class MessageCapturingFailingIntegration extends DummyIntegration {
                static Definition = {
                    ...DummyIntegration.Definition,
                    name: 'message-capturing-failing-on-delete',
                };

                constructor(params) {
                    super(params);
                    capturedMessagesExecute = this.updateIntegrationMessages.execute;
                }

                async onDelete(params) {
                    throw new Error('webhook deregistration failed');
                }
            }

            const useCaseWithThrowingIntegration = new DeleteIntegrationForUser({
                integrationRepository,
                integrationClasses: [MessageCapturingFailingIntegration],
            });
            const record = await integrationRepository.createIntegration(
                ['e1'],
                'user-1',
                { type: 'message-capturing-failing-on-delete' }
            );

            await expect(
                useCaseWithThrowingIntegration.execute(record.id, 'user-1')
            ).rejects.toThrow('webhook deregistration failed');

            expect(capturedMessagesExecute).toHaveBeenCalledWith(
                record.id,
                'errors',
                'Integration Deletion Error',
                expect.stringContaining('webhook deregistration failed'),
                expect.any(Number)
            );
        });
    });

    describe('edge cases', () => {
        it('handles deletion of already deleted integration', async () => {
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy' });

            await useCase.execute(record.id, 'user-1');

            await expect(useCase.execute(record.id, 'user-1'))
                .rejects
                .toThrow(`Integration with id of ${record.id} does not exist`);
        });

        it('handles integration with complex config during deletion', async () => {
            const complexConfig = {
                type: 'dummy',
                settings: { nested: { deep: 'value' } },
                credentials: { encrypted: true }
            };

            const record = await integrationRepository.createIntegration(['e1'], 'user-1', complexConfig);

            await useCase.execute(record.id, 'user-1');

            const found = await integrationRepository.findIntegrationById(record.id);
            expect(found).toBeNull();
        });

        it('handles null userId gracefully', async () => {
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy' });

            await expect(useCase.execute(record.id, null))
                .rejects
                .toThrow(`Integration ${record.id} does not belong to User null`);
        });

        it('handles undefined userId gracefully', async () => {
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy' });

            await expect(useCase.execute(record.id, undefined))
                .rejects
                .toThrow(`Integration ${record.id} does not belong to User undefined`);
        });
    });

    describe('deletion lifecycle (IN_DELETION)', () => {
        it('marks the integration IN_DELETION before teardown runs', async () => {
            capturedStatusAtDelete = undefined;
            const useCaseCapturing = new DeleteIntegrationForUser({
                integrationRepository,
                integrationClasses: [StatusCapturingDeleteIntegration],
            });
            const record = await integrationRepository.createIntegration(
                ['e1'],
                'user-1',
                { type: 'dummy' }
            );

            await useCaseCapturing.execute(record.id, 'user-1');

            expect(capturedStatusAtDelete).toBe('IN_DELETION');
        });

        it('leaves the row IN_DELETION and undeleted when teardown throws', async () => {
            capturedStatusAtDelete = undefined;
            const useCaseFailing = new DeleteIntegrationForUser({
                integrationRepository,
                integrationClasses: [FailingDeleteIntegration],
            });
            const record = await integrationRepository.createIntegration(
                ['e1'],
                'user-1',
                { type: 'dummy' }
            );

            await expect(
                useCaseFailing.execute(record.id, 'user-1')
            ).rejects.toThrow('teardown failed');

            expect(capturedStatusAtDelete).toBe('IN_DELETION');
            const found = await integrationRepository.findIntegrationById(
                record.id
            );
            expect(found).not.toBeNull();
        });
    });
});