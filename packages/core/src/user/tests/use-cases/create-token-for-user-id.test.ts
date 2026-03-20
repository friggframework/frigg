import {
    CreateTokenForUserId,
} from '../../use-cases/create-token-for-user-id';
import { TestUserRepository } from '../doubles/test-user-repository';

describe('CreateTokenForUserId Use Case', () => {
    it('should create and return a token via the repository', async () => {
        const userConfig = {};
        const userRepository = new TestUserRepository({ userConfig });
        const createTokenForUserId = new CreateTokenForUserId({ userRepository: userRepository as any });

        const userId = 'user-123';
        const token = await createTokenForUserId.execute(userId);

        expect(token).toBeDefined();
        expect(token).toContain(`token-for-${userId}`);
    });
});
