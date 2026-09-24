jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const mockIntegrationRepo = {
    findIntegrationById: jest.fn(),
    findIntegrations: jest.fn(),
};

jest.mock(
    '../../integrations/repositories/integration-repository-factory',
    () => ({
        createIntegrationRepository: jest.fn(() => mockIntegrationRepo),
    })
);

const { createIntegrationCommands } = require('./integration-commands');

describe('integration commands — class-agnostic reads', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('exposes read commands without an integrationClass', () => {
        const commands = createIntegrationCommands();

        expect(typeof commands.findIntegrationById).toBe('function');
        expect(typeof commands.listIntegrations).toBe('function');
        // Class-scoped commands require an integrationClass and are not built here
        expect(commands.createIntegration).toBeUndefined();
        expect(commands.updateIntegrationConfig).toBeUndefined();
    });

    describe('findIntegrationById', () => {
        it('returns the integration record from the repository', async () => {
            const record = { id: 'int-1', config: { type: 'attio' } };
            mockIntegrationRepo.findIntegrationById.mockResolvedValue(record);
            const commands = createIntegrationCommands();

            const result = await commands.findIntegrationById('int-1');

            expect(
                mockIntegrationRepo.findIntegrationById
            ).toHaveBeenCalledWith('int-1');
            expect(result).toEqual(record);
        });

        it('maps a repository throw to the {error} result convention', async () => {
            mockIntegrationRepo.findIntegrationById.mockRejectedValue(
                new Error('Integration with id int-x not found')
            );
            const commands = createIntegrationCommands();

            const result = await commands.findIntegrationById('int-x');

            expect(result).toEqual({
                error: 500,
                reason: 'Integration with id int-x not found',
                code: undefined,
            });
        });
    });

    describe('listIntegrations', () => {
        it('passes the filter through and returns matching integrations', async () => {
            const rows = [{ id: 'int-1' }, { id: 'int-2' }];
            mockIntegrationRepo.findIntegrations.mockResolvedValue(rows);
            const commands = createIntegrationCommands();

            const result = await commands.listIntegrations({
                type: 'attio',
                status: 'ENABLED',
            });

            expect(mockIntegrationRepo.findIntegrations).toHaveBeenCalledWith({
                type: 'attio',
                status: 'ENABLED',
            });
            expect(result).toEqual(rows);
        });

        it('defaults to an empty filter (all integrations)', async () => {
            mockIntegrationRepo.findIntegrations.mockResolvedValue([]);
            const commands = createIntegrationCommands();

            await commands.listIntegrations();

            expect(mockIntegrationRepo.findIntegrations).toHaveBeenCalledWith(
                {}
            );
        });

        it('maps a repository throw to the {error} result convention', async () => {
            mockIntegrationRepo.findIntegrations.mockRejectedValue(
                new Error('db down')
            );
            const commands = createIntegrationCommands();

            const result = await commands.listIntegrations();

            expect(result).toEqual({
                error: 500,
                reason: 'db down',
                code: undefined,
            });
        });
    });
});
