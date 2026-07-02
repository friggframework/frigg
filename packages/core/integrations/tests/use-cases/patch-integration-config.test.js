const { PatchIntegrationConfig } = require('../../use-cases/patch-integration-config');
const { TestIntegrationRepository } = require('../doubles/test-integration-repository');

describe('PatchIntegrationConfig Use-Case', () => {
    let integrationRepository;
    let useCase;

    beforeEach(() => {
        integrationRepository = new TestIntegrationRepository();
        useCase = new PatchIntegrationConfig({ integrationRepository });
    });

    describe('happy path', () => {
        it('merges patch keys into existing config without touching other keys', async () => {
            const record = await integrationRepository.createIntegration(
                ['entity-1'],
                'user-1',
                { type: 'attio', resourceIds: ['a'] }
            );

            await useCase.execute(record.id, { attioWebhookId: 'wh_1' });

            const updated = await integrationRepository.findIntegrationById(record.id);
            expect(updated.config).toEqual({
                type: 'attio',
                resourceIds: ['a'],
                attioWebhookId: 'wh_1',
            });
        });

        it('returns the updated integration record with merged config', async () => {
            const record = await integrationRepository.createIntegration(
                ['entity-1'],
                'user-1',
                { type: 'attio' }
            );

            const result = await useCase.execute(record.id, { attioWebhookId: 'wh_1' });

            expect(result.config).toEqual({ type: 'attio', attioWebhookId: 'wh_1' });
        });

        it('overwrites an existing key with the patch value', async () => {
            const record = await integrationRepository.createIntegration(
                ['entity-1'],
                'user-1',
                { type: 'attio', attioWebhookId: 'wh_old' }
            );

            await useCase.execute(record.id, { attioWebhookId: 'wh_new' });

            const updated = await integrationRepository.findIntegrationById(record.id);
            expect(updated.config.attioWebhookId).toBe('wh_new');
        });

        it('persists both sides of concurrent disjoint patches (no last-writer-wins)', async () => {
            const record = await integrationRepository.createIntegration(
                ['entity-1'],
                'user-1',
                { type: 'attio' }
            );

            await Promise.all([
                useCase.execute(record.id, { attioWebhookId: 'wh_1' }),
                useCase.execute(record.id, { quoMessageWebhooks: ['msg_1'] }),
            ]);

            const updated = await integrationRepository.findIntegrationById(record.id);
            expect(updated.config).toEqual({
                type: 'attio',
                attioWebhookId: 'wh_1',
                quoMessageWebhooks: ['msg_1'],
            });
        });
    });

    describe('error cases', () => {
        it('throws when a patch value is null and leaves config unchanged', async () => {
            const record = await integrationRepository.createIntegration(
                ['entity-1'],
                'user-1',
                { type: 'attio' }
            );

            await expect(
                useCase.execute(record.id, { attioWebhookId: null })
            ).rejects.toThrow('cannot be null or undefined');

            const unchanged = await integrationRepository.findIntegrationById(record.id);
            expect(unchanged.config).toEqual({ type: 'attio' });
        });

        it('throws when a patch value is undefined', async () => {
            const record = await integrationRepository.createIntegration(
                ['entity-1'],
                'user-1',
                { type: 'attio' }
            );

            await expect(
                useCase.execute(record.id, { attioWebhookId: undefined })
            ).rejects.toThrow('cannot be null or undefined');
        });

        it('throws for an empty patch', async () => {
            const record = await integrationRepository.createIntegration(
                ['entity-1'],
                'user-1',
                { type: 'attio' }
            );

            await expect(useCase.execute(record.id, {})).rejects.toThrow(
                'patch must contain at least one key'
            );
        });

        it('throws when integration does not exist', async () => {
            await expect(
                useCase.execute('non-existent-id', { attioWebhookId: 'wh_1' })
            ).rejects.toThrow('Integration with id non-existent-id not found');
        });
    });
});
