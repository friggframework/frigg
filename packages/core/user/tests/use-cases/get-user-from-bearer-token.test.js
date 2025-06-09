const {
    GetUserFromBearerToken,
} = require('../../use-cases/get-user-from-bearer-token');
const { TestUserRepository } = require('../doubles/test-user-repository');

describe('GetUserFromBearerToken Use Case', () => {
    let userRepository;
    let getUserFromBearerToken;
    let userDefinition;

    beforeEach(() => {
        userDefinition = {
            primary: 'individual',
            individualUserRequired: true,
            organizationUserRequired: false,
        };
        userRepository = new TestUserRepository({ userDefinition });
        getUserFromBearerToken = new GetUserFromBearerToken({
            userRepository
        });
    });

    it('should retrieve a user for a valid bearer token', async () => {
        const userId = 'user-123';
        const token = await userRepository.createToken(userId);
        const createdUser = await userRepository.createIndividualUser({
            id: userId,
        });

        const user = await getUserFromBearerToken.execute(`Bearer ${token}`);

        expect(user).toBeDefined();
        expect(user.getId()).toBe(createdUser.getId());
    });

    it('should throw an unauthorized error if the bearer token is missing', async () => {
        await expect(getUserFromBearerToken.execute(null)).rejects.toThrow(
            'Missing Authorization Header'
        );
    });

    it('should throw an unauthorized error for an invalid token format', async () => {
        await expect(
            getUserFromBearerToken.execute('InvalidToken')
        ).rejects.toThrow('Invalid Token Format');
    });

    it('should throw an unauthorized error if the token is not found', async () => {
        userRepository.getUserFromToken = jest.fn().mockResolvedValue(null);
        await expect(
            getUserFromBearerToken.execute('Bearer invalid-token')
        ).rejects.toThrow('Invalid Token');
    });

    it('should throw an unauthorized error if the token is valid but finds no user', async () => {
        userRepository.getUserFromToken = jest.fn().mockResolvedValue(null);
        const token = await userRepository.createToken('user-dne');
        await expect(
            getUserFromBearerToken.execute(`Bearer ${token}`)
        ).rejects.toThrow('Invalid Token');
    });
}); 