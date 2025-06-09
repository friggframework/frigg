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
        const user = await createIndividualUser.execute(params);

        expect(user).toBeDefined();
        expect(user.individualUser.username).toBe(params.username);
    });
});