const {
    CreateOrganizationUser,
} = require('../../use-cases/create-organization-user');
const { TestUserRepository } = require('../doubles/test-user-repository');
const { UserFactory } = require('../../user-factory');

describe('CreateOrganizationUser Use Case', () => {
    it('should create and return an organization user via the repository', async () => {
        const userRepository = new TestUserRepository();
        const userFactory = new UserFactory();
        const createOrganizationUser = new CreateOrganizationUser({
            userRepository,
            userFactory,
        });

        const params = {
            name: 'Test Org',
            appOrgId: 'org-123',
        };
        const result = await createOrganizationUser.execute(params);

        expect(result).toBeDefined();
        expect(result.organizationUser.name).toBe(params.name);
    });
}); 