const {
    GetUserFromBearerToken,
} = require('../../use-cases/get-user-from-bearer-token');
const { TestUserRepository } = require('../doubles/test-user-repository');

describe('GetUserFromBearerToken Use Case', () => {
    let userRepository;
    let getUserFromBearerToken;

    beforeEach(() => {
        userRepository = new TestUserRepository();
        getUserFromBearerToken = new GetUserFromBearerToken({ userRepository });
    });

    it('should retrieve a user for a valid bearer token', async () => {
        const createdUser = await userRepository.createIndividualUser({
            username: 'test-user',
        });
        const token = await userRepository.createToken(createdUser.id);

        // The real use case expects a "Bearer <token>" string
        const result = await getUserFromBearerToken.execute(`Bearer ${token}`);

        // We check for the ID because they are different object instances
        expect(result.getId()).toBe(createdUser.id);
    });

    it('should throw an unauthorized error if the bearer token is missing', async () => {
        await expect(getUserFromBearerToken.execute(null)).rejects.toThrow(
            'Missing Authorization Header'
        );
    });

    it('should throw an unauthorized error for an invalid token format', async () => {
        await expect(
            getUserFromBearerToken.execute('invalid-token-format')
        ).rejects.toThrow('Invalid Token Format');
    });

    it('should throw an unauthorized error if the token is not found', async () => {
        await expect(
            getUserFromBearerToken.execute('Bearer non-existent-token')
        ).rejects.toThrow('Invalid Token');
    });

    it('should throw an unauthorized error if the token is valid but finds no user', async () => {
        // This simulates a token that exists but points to a deleted user
        const userId = 'a-real-user-id';
        const token = await userRepository.createToken(userId);

        await expect(
            getUserFromBearerToken.execute(`Bearer ${token}`)
        ).rejects.toThrow('Invalid Token');
    });
}); 