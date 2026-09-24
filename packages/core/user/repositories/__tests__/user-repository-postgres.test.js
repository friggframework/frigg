// Mock prisma + token repo BEFORE importing the repository
jest.mock('../../../database/prisma', () => ({
    prisma: {
        user: {
            findMany: jest.fn(),
        },
    },
}));
jest.mock('../../../token/repositories/token-repository-factory', () => ({
    createTokenRepository: jest.fn(() => ({})),
}));

const { prisma } = require('../../../database/prisma');
const { UserRepositoryPostgres } = require('../user-repository-postgres');

describe('UserRepositoryPostgres.findIndividualUsersByOrganizationId', () => {
    let repository;

    beforeEach(() => {
        repository = new UserRepositoryPostgres();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('queries INDIVIDUAL users by integer organizationId and stringifies returned ids', async () => {
        prisma.user.findMany.mockResolvedValue([
            {
                id: 2018,
                type: 'INDIVIDUAL',
                organizationId: 2019,
                appUserId: 'USx4fhpNuR',
            },
        ]);

        const result =
            await repository.findIndividualUsersByOrganizationId('2019');

        expect(prisma.user.findMany).toHaveBeenCalledWith({
            where: {
                organizationId: 2019,
                type: 'INDIVIDUAL',
            },
        });
        expect(result).toEqual([
            {
                id: '2018',
                type: 'INDIVIDUAL',
                organizationId: '2019',
                appUserId: 'USx4fhpNuR',
            },
        ]);
    });

    it('returns an empty array when no individual users are linked', async () => {
        prisma.user.findMany.mockResolvedValue([]);

        expect(
            await repository.findIndividualUsersByOrganizationId('2019')
        ).toEqual([]);
    });
});
