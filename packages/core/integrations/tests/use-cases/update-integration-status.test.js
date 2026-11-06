const { UpdateIntegrationStatus } = require('../../use-cases/update-integration-status');
const { TestIntegrationRepository } = require('../doubles/test-integration-repository');

describe('UpdateIntegrationStatus Use-Case', () => {
    let integrationRepository;
    let useCase;

    beforeEach(() => {
        integrationRepository = new TestIntegrationRepository();
        useCase = new UpdateIntegrationStatus({
            integrationRepository,
        });
    });

    describe('happy path', () => {
        it('updates integration status', async () => {
            const record = await integrationRepository.createIntegration(['entity-1'], 'user-1', { type: 'dummy' });

            const result = await useCase.execute(record.id, 'ACTIVE');

            expect(result).toBe(true);

            const updatedRecord = await integrationRepository.findIntegrationById(record.id);
            expect(updatedRecord.status).toBe('ACTIVE');
        });

        it('tracks status update operation', async () => {
            const record = await integrationRepository.createIntegration(['entity-1'], 'user-1', { type: 'dummy' });
            integrationRepository.clearHistory();

            await useCase.execute(record.id, 'PAUSED');

            const history = integrationRepository.getOperationHistory();
            const updateOperation = history.find(op => op.operation === 'updateStatus');
            expect(updateOperation).toEqual({
                operation: 'updateStatus',
                id: record.id,
                status: 'PAUSED',
                success: true
            });
        });

        it('handles different status values', async () => {
            const record = await integrationRepository.createIntegration(['entity-1'], 'user-1', { type: 'dummy' });

            const statuses = ['ACTIVE', 'PAUSED', 'ERROR', 'DISABLED'];

            for (const status of statuses) {
                await useCase.execute(record.id, status);
                const updatedRecord = await integrationRepository.findIntegrationById(record.id);
                expect(updatedRecord.status).toBe(status);
            }
        });
    });

    describe('error cases', () => {
        it('returns false when integration not found', async () => {
            const nonExistentId = 'non-existent-id';

            const result = await useCase.execute(nonExistentId, 'ACTIVE');

            expect(result).toBe(false);
        });

        it('tracks failed update operation', async () => {
            const nonExistentId = 'non-existent-id';
            integrationRepository.clearHistory();

            await useCase.execute(nonExistentId, 'ACTIVE');

            const history = integrationRepository.getOperationHistory();
            const updateOperation = history.find(op => op.operation === 'updateStatus');
            expect(updateOperation).toEqual({
                operation: 'updateStatus',
                id: nonExistentId,
                status: 'ACTIVE',
                success: false
            });
        });
    });

    describe('edge cases', () => {
        it('handles null status value', async () => {
            const record = await integrationRepository.createIntegration(['entity-1'], 'user-1', { type: 'dummy' });

            const result = await useCase.execute(record.id, null);

            expect(result).toBe(true);
            const updatedRecord = await integrationRepository.findIntegrationById(record.id);
            expect(updatedRecord.status).toBeNull();
        });

        it('handles empty string status', async () => {
            const record = await integrationRepository.createIntegration(['entity-1'], 'user-1', { type: 'dummy' });

            const result = await useCase.execute(record.id, '');

            expect(result).toBe(true);
            const updatedRecord = await integrationRepository.findIntegrationById(record.id);
            expect(updatedRecord.status).toBe('');
        });
    });
});
