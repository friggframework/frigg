jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { IntegrationBase } = require('../integration-base');
const {
    TestIntegrationRepository,
} = require('./doubles/test-integration-repository');
const {
    PatchIntegrationConfig,
} = require('../use-cases/patch-integration-config');

describe('IntegrationBase.patchConfig', () => {
    let integration;
    let mockPatchIntegrationConfig;

    beforeEach(() => {
        integration = new IntegrationBase();
        integration.id = 'int-1';
        integration.config = { type: 'attio' };

        mockPatchIntegrationConfig = { execute: jest.fn() };
        integration.patchIntegrationConfig = mockPatchIntegrationConfig;
    });

    it('persists the patch through the injected use case', async () => {
        mockPatchIntegrationConfig.execute.mockResolvedValue({
            config: { type: 'attio', attioWebhookId: 'wh_1' },
        });

        await integration.patchConfig({ attioWebhookId: 'wh_1' });

        expect(mockPatchIntegrationConfig.execute).toHaveBeenCalledWith(
            'int-1',
            { attioWebhookId: 'wh_1' }
        );
    });

    it('syncs this.config from the returned row', async () => {
        mockPatchIntegrationConfig.execute.mockResolvedValue({
            config: { type: 'attio', attioWebhookId: 'wh_1' },
        });

        await integration.patchConfig({ attioWebhookId: 'wh_1' });

        expect(integration.config).toEqual({
            type: 'attio',
            attioWebhookId: 'wh_1',
        });
    });

    it('leaves this.config unchanged when the patch fails', async () => {
        mockPatchIntegrationConfig.execute.mockRejectedValue(
            new Error('db write failed')
        );

        await expect(
            integration.patchConfig({ attioWebhookId: 'wh_1' })
        ).rejects.toThrow('db write failed');
        expect(integration.config).toEqual({ type: 'attio' });
    });

    it("reflects a concurrent writer's key even though this.config was stale", async () => {
        const integrationRepository = new TestIntegrationRepository();
        const record = await integrationRepository.createIntegration(
            ['entity-1'],
            'user-1',
            { type: 'attio' }
        );

        integration.id = record.id;
        integration.config = { type: 'attio' };
        integration.patchIntegrationConfig = new PatchIntegrationConfig({
            integrationRepository,
        });

        // Simulates a second Lambda invocation writing directly to the
        // repository between this instance's hydration and its own patch.
        await integrationRepository.patchIntegrationConfig(record.id, {
            quoMessageWebhooks: ['msg_1'],
        });

        await integration.patchConfig({ attioWebhookId: 'wh_1' });

        expect(integration.config).toEqual({
            type: 'attio',
            quoMessageWebhooks: ['msg_1'],
            attioWebhookId: 'wh_1',
        });
    });
});

describe('IntegrationBase.updateConfig', () => {
    let integration;
    let mockUpdateIntegrationConfig;

    beforeEach(() => {
        integration = new IntegrationBase();
        integration.id = 'int-1';
        integration.config = { type: 'attio', legacyKey: 'x' };

        mockUpdateIntegrationConfig = { execute: jest.fn() };
        integration.updateIntegrationConfig = mockUpdateIntegrationConfig;
    });

    it('persists the full config through the injected use case', async () => {
        mockUpdateIntegrationConfig.execute.mockResolvedValue({
            config: { type: 'attio' },
        });

        await integration.updateConfig({ type: 'attio' });

        expect(mockUpdateIntegrationConfig.execute).toHaveBeenCalledWith(
            'int-1',
            { type: 'attio' }
        );
    });

    it('replaces this.config entirely, dropping keys omitted from the new config', async () => {
        mockUpdateIntegrationConfig.execute.mockResolvedValue({
            config: { type: 'attio' },
        });

        await integration.updateConfig({ type: 'attio' });

        expect(integration.config).toEqual({ type: 'attio' });
    });

    it('leaves this.config unchanged when the update fails', async () => {
        mockUpdateIntegrationConfig.execute.mockRejectedValue(
            new Error('db down')
        );

        await expect(integration.updateConfig({ type: 'attio' })).rejects.toThrow(
            'db down'
        );
        expect(integration.config).toEqual({ type: 'attio', legacyKey: 'x' });
    });
});
