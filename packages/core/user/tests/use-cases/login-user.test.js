const bcrypt = require('bcryptjs');
const { LoginUser } = require('../../use-cases/login-user');
const { TestUserRepository } = require('../doubles/test-user-repository');

jest.mock('bcryptjs', () => ({
    compareSync: jest.fn(),
}));

describe('LoginUser Use Case', () => {
    let userRepository;
    let loginUser;
    let userConfig;

    beforeEach(() => {
        userConfig = { usePassword: true, individualUserRequired: true, organizationUserRequired: false };
        userRepository = new TestUserRepository({ userConfig });
        loginUser = new LoginUser({ userRepository, userConfig });

        bcrypt.compareSync.mockClear();
    });

    describe('With Password Authentication', () => {
        it('should successfully log in a user with correct credentials', async () => {
            const username = 'test-user';
            const password = 'password123';
            await userRepository.createIndividualUser({
                username,
                hashword: 'hashed-password',
            });

            bcrypt.compareSync.mockReturnValue(true);

            const user = await loginUser.execute({ username, password });

            expect(bcrypt.compareSync).toHaveBeenCalledWith(
                password,
                'hashed-password'
            );
            expect(user).toBeDefined();
            expect(user.getIndividualUser().username).toBe(username);
        });

        it('should throw an unauthorized error for an incorrect password', async () => {
            const username = 'test-user';
            const password = 'wrong-password';
            await userRepository.createIndividualUser({
                username,
                hashword: 'hashed-password',
            });

            bcrypt.compareSync.mockReturnValue(false);

            await expect(
                loginUser.execute({ username, password })
            ).rejects.toThrow('Incorrect username or password');
        });

        it('should throw an unauthorized error for a non-existent user', async () => {
            const username = 'non-existent-user';
            const password = 'password123';

            await expect(
                loginUser.execute({ username, password })
            ).rejects.toThrow('user not found');
        });
    });

    describe('Without Password (appUserId)', () => {
        beforeEach(() => {
            userConfig = { usePassword: false, individualUserRequired: true, organizationUserRequired: false };
            userRepository = new TestUserRepository({ userConfig });
            loginUser = new LoginUser({
                userRepository,
                userConfig,
            });
        });

        it('should successfully retrieve a user by appUserId', async () => {
            const appUserId = 'app-user-123';
            const createdUserData = await userRepository.createIndividualUser({
                appUserId,
            });

            const result = await loginUser.execute({ appUserId });
            expect(result.getId()).toBe(createdUserData.id);
        });
    });

    describe('With Organization User', () => {
        beforeEach(() => {
            userConfig = {
                primary: 'organization',
                individualUserRequired: false,
                organizationUserRequired: true,
            };
            userRepository = new TestUserRepository({ userConfig });
            loginUser = new LoginUser({
                userRepository,
                userConfig,
            });
        });

        it('should successfully retrieve an organization user by appOrgId', async () => {
            const appOrgId = 'app-org-123';
            const createdUserData = await userRepository.createOrganizationUser({
                name: 'Test Org',
                appOrgId,
            });

            const result = await loginUser.execute({ appOrgId });
            expect(result.getId()).toBe(createdUserData.id);
        });

        it('should throw an unauthorized error for a non-existent organization user', async () => {
            const appOrgId = 'non-existent-org';

            await expect(loginUser.execute({ appOrgId })).rejects.toThrow(
                'org user non-existent-org not found'
            );
        });
    });

    describe('Required User Checks', () => {
        it('should throw an error if a required individual user is not found', async () => {
            userConfig = {
                individualUserRequired: true,
                usePassword: false,
            };
            userRepository = new TestUserRepository({ userConfig });
            loginUser = new LoginUser({
                userRepository,
                userConfig,
            });

            await expect(
                loginUser.execute({ appUserId: 'a-non-existent-user-id' })
            ).rejects.toThrow('user not found');
        });
    });
}); 