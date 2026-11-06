const { UpdateIntegrationMessages } = require('../../use-cases/update-integration-messages');
const { TestIntegrationRepository } = require('../doubles/test-integration-repository');

describe('UpdateIntegrationMessages Use-Case', () => {
    let integrationRepository;
    let useCase;

    beforeEach(() => {
        integrationRepository = new TestIntegrationRepository();
        useCase = new UpdateIntegrationMessages({ integrationRepository });
    });

    describe('happy path', () => {
        it('adds message with correct details', async () => {
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy' });
            const timestamp = Date.now();

            await useCase.execute(record.id, 'errors', 'Test Error', 'Error details here', timestamp);

            const fetched = await integrationRepository.findIntegrationById(record.id);
            expect(fetched.messages.errors.length).toBe(1);
            expect(fetched.messages.errors[0]).toEqual({
                title: 'Test Error',
                message: 'Error details here',
                timestamp: timestamp
            });
        });

        it('adds multiple messages to same type', async () => {
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy' });

            await useCase.execute(record.id, 'errors', 'Error 1', 'First error', 1000);
            await useCase.execute(record.id, 'errors', 'Error 2', 'Second error', 2000);

            const fetched = await integrationRepository.findIntegrationById(record.id);
            expect(fetched.messages.errors.length).toBe(2);
            expect(fetched.messages.errors[0].title).toBe('Error 1');
            expect(fetched.messages.errors[1].title).toBe('Error 2');
        });

        it('adds messages to different types', async () => {
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy' });

            await useCase.execute(record.id, 'errors', 'Error Title', 'Error body', 1000);
            await useCase.execute(record.id, 'warnings', 'Warning Title', 'Warning body', 2000);
            await useCase.execute(record.id, 'info', 'Info Title', 'Info body', 3000);

            const fetched = await integrationRepository.findIntegrationById(record.id);
            expect(fetched.messages.errors.length).toBe(1);
            expect(fetched.messages.warnings.length).toBe(1);
            expect(fetched.messages.info.length).toBe(1);
        });

        it('tracks message update operation', async () => {
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy' });
            integrationRepository.clearHistory();

            await useCase.execute(record.id, 'logs', 'Log Entry', 'Log details', Date.now());

            const history = integrationRepository.getOperationHistory();
            const updateOperation = history.find(op => op.operation === 'updateMessages');
            expect(updateOperation).toEqual({
                operation: 'updateMessages',
                id: record.id,
                type: 'logs',
                success: true
            });
        });
    });

    describe('error cases', () => {
        it('returns false when integration not found', async () => {
            const nonExistentId = 'non-existent-id';

            const result = await useCase.execute(nonExistentId, 'errors', 'title', 'body', Date.now());

            expect(result).toBe(false);
        });

        it('tracks failed message update operation', async () => {
            const nonExistentId = 'non-existent-id';
            integrationRepository.clearHistory();

            await useCase.execute(nonExistentId, 'errors', 'title', 'body', Date.now());

            const history = integrationRepository.getOperationHistory();
            const updateOperation = history.find(op => op.operation === 'updateMessages');
            expect(updateOperation).toEqual({
                operation: 'updateMessages',
                id: nonExistentId,
                success: false
            });
        });
    });

    describe('edge cases', () => {
        it('handles empty title and body', async () => {
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy' });

            await useCase.execute(record.id, 'info', '', '', Date.now());

            const fetched = await integrationRepository.findIntegrationById(record.id);
            expect(fetched.messages.info[0].title).toBe('');
            expect(fetched.messages.info[0].message).toBe('');
        });

        it('handles null and undefined values', async () => {
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy' });

            await useCase.execute(record.id, 'warnings', null, undefined, null);

            const fetched = await integrationRepository.findIntegrationById(record.id);
            expect(fetched.messages.warnings[0].title).toBeNull();
            expect(fetched.messages.warnings[0].message).toBeUndefined();
            expect(fetched.messages.warnings[0].timestamp).toBeNull();
        });

        it('handles very long message content', async () => {
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy' });
            const longTitle = 'A'.repeat(1000);
            const longBody = 'B'.repeat(5000);

            await useCase.execute(record.id, 'errors', longTitle, longBody, Date.now());

            const fetched = await integrationRepository.findIntegrationById(record.id);
            expect(fetched.messages.errors[0].title).toBe(longTitle);
            expect(fetched.messages.errors[0].message).toBe(longBody);
        });

        it('handles special characters in messages', async () => {
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy' });
            const specialTitle = '🚨 Error with émojis & spëcial chars';
            const specialBody = 'Body with\nnewlines\tand\ttabs';

            await useCase.execute(record.id, 'errors', specialTitle, specialBody, Date.now());

            const fetched = await integrationRepository.findIntegrationById(record.id);
            expect(fetched.messages.errors[0].title).toBe(specialTitle);
            expect(fetched.messages.errors[0].message).toBe(specialBody);
        });
    });
}); 