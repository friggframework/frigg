jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
}));

const { IntegrationBase } = require('../integration-base');

function makeIntegration() {
    const integration = new IntegrationBase({
        id: 'int-1',
        userId: 'user-1',
        entities: [],
        config: { type: 'test' },
        status: 'ENABLED',
        version: '0.0.0',
        messages: {},
        modules: [],
    });
    integration.integrationMappingRepository = {
        createMapping: jest.fn().mockResolvedValue({ id: 'm1' }),
        deleteMapping: jest
            .fn()
            .mockResolvedValue({ acknowledged: true, deletedCount: 1 }),
    };
    return integration;
}

describe('IntegrationBase mapping helpers', () => {
    describe('createMapping', () => {
        it('delegates to the repository with this.id', async () => {
            const integration = makeIntegration();

            const result = await integration.createMapping('claim:hs:1', {
                a: 1,
            });

            expect(
                integration.integrationMappingRepository.createMapping
            ).toHaveBeenCalledWith('int-1', 'claim:hs:1', { a: 1 });
            expect(result).toEqual({ id: 'm1' });
        });

        it('propagates the repository error when the mapping exists', async () => {
            const integration = makeIntegration();
            const { MappingAlreadyExistsError } = require('../../errors');
            const error = new MappingAlreadyExistsError('int-1', 'claim:hs:1');
            integration.integrationMappingRepository.createMapping.mockRejectedValue(
                error
            );

            await expect(
                integration.createMapping('claim:hs:1', {})
            ).rejects.toBe(error);
        });

        it('rejects a missing sourceId', async () => {
            const integration = makeIntegration();

            await expect(integration.createMapping('', {})).rejects.toThrow(
                'sourceId must be set'
            );
            expect(
                integration.integrationMappingRepository.createMapping
            ).not.toHaveBeenCalled();
        });
    });

    describe('deleteMapping', () => {
        it('delegates to the repository with this.id', async () => {
            const integration = makeIntegration();

            const result = await integration.deleteMapping('claim:hs:1');

            expect(
                integration.integrationMappingRepository.deleteMapping
            ).toHaveBeenCalledWith('int-1', 'claim:hs:1');
            expect(result).toEqual({ acknowledged: true, deletedCount: 1 });
        });

        it('tolerates a missing mapping (deletedCount 0)', async () => {
            const integration = makeIntegration();
            integration.integrationMappingRepository.deleteMapping.mockResolvedValue(
                { acknowledged: true, deletedCount: 0 }
            );

            await expect(
                integration.deleteMapping('claim:hs:1')
            ).resolves.toEqual({ acknowledged: true, deletedCount: 0 });
        });

        it('rejects a missing sourceId', async () => {
            const integration = makeIntegration();

            await expect(integration.deleteMapping()).rejects.toThrow(
                'sourceId must be set'
            );
        });
    });
});
