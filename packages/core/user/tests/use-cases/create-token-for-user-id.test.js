const {
    CreateTokenForUserId,
} = require('../../use-cases/create-token-for-user-id');
const { TestUserRepository } = require('../doubles/test-user-repository');

describe('CreateTokenForUserId Use Case', () => {
    it('should create and return a token via the repository', async () => {
        const userRepository = new TestUserRepository();
        const createTokenForUserId = new CreateTokenForUserId({ userRepository });

        const userId = 'user-123';
        const minutes = 120;
        const result = await createTokenForUserId.execute(userId, minutes);

        const expectedToken = `token-for-${userId}-for-${minutes}-mins`;
        expect(result).toBe(expectedToken);
    });
}); 