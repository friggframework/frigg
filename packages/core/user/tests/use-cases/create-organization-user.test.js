const {
    CreateOrganizationUser,
} = require('../../use-cases/create-organization-user');
const { TestUserRepository } = require('../doubles/test-user-repository');

describe('CreateOrganizationUser Use Case', () => {
    it('should create and return an organization user via the repository', async () => {
        const userDefinition = {
            primary: 'organization',
            organizationUserRequired: true,
            individualUserRequired: false,
        };
        const userRepository = new TestUserRepository({ userDefinition });
        const createOrganizationUser = new CreateOrganizationUser({
            userRepository,
            userConfig: userDefinition,
        });

        const params = {
            name: 'Test Org',
            appOrgId: 'org-123',
        };
        const user = await createOrganizationUser.execute(params);

        expect(user).toBeDefined();
        expect(user.getOrganizationUser().name).toBe(params.name);
    });
}); 