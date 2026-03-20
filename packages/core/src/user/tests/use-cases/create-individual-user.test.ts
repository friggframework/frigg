import {
    CreateIndividualUser,
} from '../../use-cases/create-individual-user';
import { TestUserRepository } from '../doubles/test-user-repository';

describe('CreateIndividualUser Use Case', () => {
    it('should create and return an individual user via the repository', async () => {
        const userConfig = { usePassword: true };
        const userRepository = new TestUserRepository({ userConfig });
        const createIndividualUser = new CreateIndividualUser({
            userRepository: userRepository as any,
            userConfig: userConfig as any,
        });

        const params = {
            username: 'test-user',
            password: 'password123',
        };
        const user = await createIndividualUser.execute(params);

        expect(user).toBeDefined();
        expect(user.getIndividualUser()!.username).toBe(params.username);
    });
});
