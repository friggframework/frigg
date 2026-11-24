const { UpdateIntegrationConfig } = require('../../use-cases/update-integration-config');
const { TestIntegrationRepository } = require('../doubles/test-integration-repository');

describe('UpdateIntegrationConfig Use-Case', () => {
    let integrationRepository;
    let useCase;

    beforeEach(() => {
        integrationRepository = new TestIntegrationRepository();
        useCase = new UpdateIntegrationConfig({ integrationRepository });
    });

    describe('happy path', () => {
        it('replaces the entire config, deleting keys omitted from the new config', async () => {
            const record = await integrationRepository.createIntegration(
                ['entity-1'],
                'user-1',
                { type: 'attio', quoMessageWebhookId: 'legacy-id' }
            );

            await useCase.execute(record.id, {
                type: 'attio',
                quoMessageWebhooks: [{ id: 'legacy-id' }],
            });

            const updated = await integrationRepository.findIntegrationById(record.id);
            expect(updated.config).toEqual({
                type: 'attio',
                quoMessageWebhooks: [{ id: 'legacy-id' }],
            });
        });

        it('returns the updated integration record', async () => {
            const record = await integrationRepository.createIntegration(
                ['entity-1'],
                'user-1',
                { type: 'attio' }
            );

            const result = await useCase.execute(record.id, { type: 'attio', foo: 'bar' });

            expect(result.config).toEqual({ type: 'attio', foo: 'bar' });
        });
    });

    describe('error cases', () => {
        it('throws when config is null', async () => {
            const record = await integrationRepository.createIntegration(
                ['entity-1'],
                'user-1',
                { type: 'attio' }
            );

            await expect(useCase.execute(record.id, null)).rejects.toThrow(
                'Config parameter is required'
            );
        });

        it('throws when config is undefined', async () => {
            const record = await integrationRepository.createIntegration(
                ['entity-1'],
                'user-1',
                { type: 'attio' }
            );

            await expect(useCase.execute(record.id, undefined)).rejects.toThrow(
                'Config parameter is required'
            );
        });

        it('throws when integration does not exist', async () => {
            await expect(
                useCase.execute('non-existent-id', { type: 'attio' })
            ).rejects.toThrow('Integration with id non-existent-id not found');
        });
    });
});
