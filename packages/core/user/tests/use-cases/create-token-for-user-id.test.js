const {
    CreateTokenForUserId,
} = require('../../use-cases/create-token-for-user-id');
const { TestUserRepository } = require('../doubles/test-user-repository');

describe('CreateTokenForUserId Use Case', () => {
    it('should create and return a token via the repository', async () => {
        const userConfig = {}; // Not used by this use case, but required by the test repo
        const userRepository = new TestUserRepository({ userConfig });
        const createTokenForUserId = new CreateTokenForUserId({ userRepository });

        const userId = 'user-123';
        const token = await createTokenForUserId.execute(userId);

        expect(token).toBeDefined();
        // The mock token is deterministic, so we can check it
        expect(token).toContain(`token-for-${userId}`);
    });
}); 