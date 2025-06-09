const {
    CreateIndividualUser,
} = require('../../use-cases/create-individual-user');
const { TestUserRepository } = require('../doubles/test-user-repository');

describe('CreateIndividualUser Use Case', () => {
    it('should create and return an individual user via the repository', async () => {
        const userDefinition = { usePassword: true };
        const userRepository = new TestUserRepository({ userDefinition });
        const createIndividualUser = new CreateIndividualUser({
            userRepository,
            userConfig: userDefinition,
        });

        const params = {
            username: 'test-user',
            password: 'password123',
        };
        const user = await createIndividualUser.execute(params);

        expect(user).toBeDefined();
        expect(user.getIndividualUser().username).toBe(params.username);
    });
});