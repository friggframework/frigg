const bcrypt = require('bcryptjs');
const { LoginUser } = require('../../use-cases/login-user');
const { TestUserRepository } = require('../doubles/test-user-repository');
const { UserFactory } = require('../../user-factory');

jest.mock('bcryptjs', () => ({
    compareSync: jest.fn(),
}));

describe('LoginUser Use Case', () => {
    let userRepository;
    let userFactory;
    let loginUser;

    beforeEach(() => {
        userRepository = new TestUserRepository();
        userFactory = new UserFactory({ usePassword: true });
        loginUser = new LoginUser({ userRepository, userFactory });

        bcrypt.compareSync.mockClear();
    });

    describe('With Password Authentication', () => {
        it('should successfully log in a user with correct credentials', async () => {
            const username = 'test-user';
            const password = 'password123';
            const hashword = 'hashed-password';
            await userRepository.createIndividualUser({
                username,
                hashword,
            });

            bcrypt.compareSync.mockReturnValue(true);

            const user = await loginUser.execute({ username, password });

            expect(bcrypt.compareSync).toHaveBeenCalledWith(password, hashword);
            expect(user).toBeDefined();
            expect(user.individualUser.username).toBe(username);
        });

        it('should throw an unauthorized error for an incorrect password', async () => {
            const username = 'test-user';
            const password = 'wrong-password';
            const hashword = 'hashed-password';
            await userRepository.createIndividualUser({
                username,
                hashword,
            });

            bcrypt.compareSync.mockReturnValue(false);

            await expect(loginUser.execute({ username, password })).rejects.toThrow('incorrect username or password');
        });

        it('should throw an unauthorized error for a non-existent user', async () => {
            const username = 'non-existent-user';
            const password = 'password123';

            await expect(loginUser.execute({ username, password })).rejects.toThrow('incorrect username or password');
        });
    });

    describe('Without Password (appUserId)', () => {
        beforeEach(() => {
            const userFactoryNoPassword = new UserFactory({ usePassword: false });
            loginUser = new LoginUser({
                userRepository,
                userFactory: userFactoryNoPassword,
            });
        });

        it('should successfully retrieve a user by appUserId', async () => {
            const appUserId = 'app-user-123';
            await userRepository.createIndividualUser({
                appUserId,
            });

            const result = await loginUser.execute({ appUserId });
            expect(result.individualUser.appUserId).toBe(appUserId);
        });
    });

    describe('With Organization User', () => {
        beforeEach(() => {
            userFactory = new UserFactory({
                individualUserRequired: false,
                organizationUserRequired: true,
            });
            loginUser = new LoginUser({
                userRepository,
                userFactory,
            });
        });

        it('should successfully retrieve an organization user by appOrgId', async () => {
            const appOrgId = 'app-org-123';
            await userRepository.createOrganizationUser({
                name: 'Test Org',
                appOrgId,
            });

            const result = await loginUser.execute({ appOrgId });
            expect(result.organizationUser.appOrgId).toBe(appOrgId);
        });

        it('should throw an unauthorized error for a non-existent organization user', async () => {
            const appOrgId = 'non-existent-org';

            await expect(loginUser.execute({ appOrgId })).rejects.toThrow(
                `org user ${appOrgId} not found`
            );
        });
    });

    describe('Required User Checks', () => {
        it('should throw an error if a required individual user is not found', async () => {
            userFactory = new UserFactory({ individualUserRequired: true });
            loginUser = new LoginUser({
                userRepository,
                userFactory,
            });

            await expect(loginUser.execute({ username: 'dne' })).rejects.toThrow('user not found');
        });
    });
}); 