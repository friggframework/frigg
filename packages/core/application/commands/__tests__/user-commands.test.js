// Mock the repository factory BEFORE importing the commands
jest.mock('../../../user/repositories/user-repository-factory', () => ({
    createUserRepository: jest.fn(),
}));

const {
    createUserRepository,
} = require('../../../user/repositories/user-repository-factory');
const { createUserCommands } = require('../user-commands');

describe('user-commands findIndividualUsersByOrganizationId', () => {
    let repository;

    beforeEach(() => {
        repository = {
            findIndividualUsersByOrganizationId: jest.fn(),
        };
        createUserRepository.mockReturnValue(repository);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('projects individual users and includes appUserId (the field the org finder drops)', async () => {
        repository.findIndividualUsersByOrganizationId.mockResolvedValue([
            {
                id: '2018',
                username: 'app-user-USx4fhpNuR',
                email: 'USx4fhpNuR@app.local',
                appUserId: 'USx4fhpNuR',
                hashword: 'should-not-leak',
            },
        ]);

        const commands = createUserCommands();
        const result =
            await commands.findIndividualUsersByOrganizationId('2019');

        expect(
            repository.findIndividualUsersByOrganizationId
        ).toHaveBeenCalledWith('2019');
        expect(result).toEqual([
            {
                id: '2018',
                username: 'app-user-USx4fhpNuR',
                email: 'USx4fhpNuR@app.local',
                appUserId: 'USx4fhpNuR',
            },
        ]);
        // The whole point of this lookup: appUserId is exposed, hashword is not.
        expect(result[0].appUserId).toBe('USx4fhpNuR');
        expect(result[0]).not.toHaveProperty('hashword');
    });

    it('returns an empty array when the organization has no individual users', async () => {
        repository.findIndividualUsersByOrganizationId.mockResolvedValue([]);

        const commands = createUserCommands();

        expect(
            await commands.findIndividualUsersByOrganizationId('2019')
        ).toEqual([]);
    });

    it('returns a 400 error response when organizationUserId is missing', async () => {
        const commands = createUserCommands();

        const result = await commands.findIndividualUsersByOrganizationId();

        expect(result).toEqual({
            error: 400,
            reason: 'organizationUserId is required',
            code: 'INVALID_USER_DATA',
        });
        expect(
            repository.findIndividualUsersByOrganizationId
        ).not.toHaveBeenCalled();
    });

    it('maps repository errors to an error response', async () => {
        repository.findIndividualUsersByOrganizationId.mockRejectedValue(
            new Error('db down')
        );

        const commands = createUserCommands();
        const result =
            await commands.findIndividualUsersByOrganizationId('2019');

        expect(result).toEqual({ error: 500, reason: 'db down' });
    });
});
