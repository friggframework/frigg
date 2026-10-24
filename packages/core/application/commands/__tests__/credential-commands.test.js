// Mock the repository factory BEFORE importing the commands
jest.mock('../../../credential/repositories/credential-repository-factory', () => ({
    createCredentialRepository: jest.fn(),
}));

const {
    createCredentialRepository,
} = require('../../../credential/repositories/credential-repository-factory');
const { createCredentialCommands } = require('../credential-commands');

describe('credential-commands countActiveByType', () => {
    let repository;

    beforeEach(() => {
        repository = {
            countActiveByType: jest.fn(),
        };
        createCredentialRepository.mockReturnValue(repository);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('delegates to the repository with { since } and returns its projection', async () => {
        const since = new Date('2026-06-15T00:00:00Z');
        repository.countActiveByType.mockResolvedValue([
            { integrationType: 'hubspot', count: 3 },
            { integrationType: 'salesforce', count: 1 },
        ]);

        const commands = createCredentialCommands();
        const result = await commands.countActiveByType({ since });

        expect(repository.countActiveByType).toHaveBeenCalledWith({ since });
        expect(result).toEqual([
            { integrationType: 'hubspot', count: 3 },
            { integrationType: 'salesforce', count: 1 },
        ]);
    });

    it('passes through an undefined since (count-all)', async () => {
        repository.countActiveByType.mockResolvedValue([]);

        const commands = createCredentialCommands();
        const result = await commands.countActiveByType();

        expect(repository.countActiveByType).toHaveBeenCalledWith({
            since: undefined,
        });
        expect(result).toEqual([]);
    });

    it('never throws — maps repository errors to an error response', async () => {
        repository.countActiveByType.mockRejectedValue(new Error('db down'));

        const commands = createCredentialCommands();
        const result = await commands.countActiveByType({ since: new Date() });

        expect(result).toEqual({ error: 500, reason: 'db down' });
    });
});
