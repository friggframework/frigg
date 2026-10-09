const mockMappingRepo = { countByIntegrationIds: jest.fn() };

jest.mock(
    '../../integrations/repositories/integration-mapping-repository-factory',
    () => ({
        createIntegrationMappingRepository: () => mockMappingRepo,
    })
);

const {
    createIntegrationMappingCommands,
} = require('./integration-mapping-commands');

describe('createIntegrationMappingCommands', () => {
    let commands;

    beforeEach(() => {
        jest.clearAllMocks();
        commands = createIntegrationMappingCommands();
    });

    it('delegates countByIntegrationIds to the repository', async () => {
        const map = new Map([['1', 3]]);
        mockMappingRepo.countByIntegrationIds.mockResolvedValue(map);

        const result = await commands.countByIntegrationIds(['1']);

        expect(mockMappingRepo.countByIntegrationIds).toHaveBeenCalledWith(['1']);
        expect(result).toBe(map);
    });

    it('maps a repository error to an error response', async () => {
        mockMappingRepo.countByIntegrationIds.mockRejectedValue(
            new Error('boom')
        );

        const result = await commands.countByIntegrationIds(['1']);

        expect(result).toMatchObject({ error: 500, reason: 'boom' });
    });
});
