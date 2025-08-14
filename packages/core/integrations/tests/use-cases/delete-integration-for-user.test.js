const { DeleteIntegrationForUser } = require('../../use-cases/delete-integration-for-user');
const { TestIntegrationRepository } = require('../doubles/test-integration-repository');
const { DummyIntegration } = require('../doubles/dummy-integration-class');

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
}); 