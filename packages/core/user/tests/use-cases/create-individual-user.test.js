const {
    CreateIndividualUser,
} = require('../../use-cases/create-individual-user');
const { TestUserRepository } = require('../doubles/test-user-repository');
const { UserFactory } = require('../../user-factory');

describe('CreateIndividualUser Use Case', () => {
    it('should create and return an individual user via the repository', async () => {
        const userRepository = new TestUserRepository();
        const userFactory = new UserFactory();
        const createIndividualUser = new CreateIndividualUser({ userRepository, userFactory });

        const params = {
            username: 'test-user',
            password: 'password123',
        };
        const result = await createIndividualUser.execute(params);

        expect(result).toBeDefined();
        expect(result.individualUser.username).toBe(params.username);
    });
}); 