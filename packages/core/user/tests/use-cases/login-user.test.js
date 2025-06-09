const bcrypt = require('bcryptjs');
const { LoginUser } = require('../../use-cases/login-user');
const { TestUserRepository } = require('../doubles/test-user-repository');

jest.mock('bcryptjs', () => ({
    compareSync: jest.fn(),
}));

describe('LoginUser Use Case', () => {
    let userRepository;
    let loginUser;
    let userDefinition;

    beforeEach(() => {
        userDefinition = { usePassword: true, individualUserRequired: true, organizationUserRequired: false };
        userRepository = new TestUserRepository({ userDefinition });
        loginUser = new LoginUser({ userRepository, userConfig: userDefinition });

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
            userRepository.findIndividualUserByUsername = jest
                .fn()
                .mockRejectedValue(new Error('user not found'));

            await expect(
                loginUser.execute({ username, password })
            ).rejects.toThrow('user not found');
        });
    });

    describe('Without Password (appUserId)', () => {
        beforeEach(() => {
            userDefinition = { usePassword: false, individualUserRequired: true, organizationUserRequired: false };
            userRepository = new TestUserRepository({ userDefinition });
            loginUser = new LoginUser({
                userRepository,
                userConfig: userDefinition,
            });
        });

        it('should successfully retrieve a user by appUserId', async () => {
            const appUserId = 'app-user-123';
            const createdUser = await userRepository.createIndividualUser({
                appUserId,
            });

            const result = await loginUser.execute({ appUserId });
            expect(result.getId()).toBe(createdUser.getId());
        });
    });

    describe('With Organization User', () => {
        beforeEach(() => {
            userDefinition = {
                individualUserRequired: false,
                organizationUserRequired: true,
            };
            userRepository = new TestUserRepository({ userDefinition });
            loginUser = new LoginUser({
                userRepository,
                userConfig: userDefinition,
            });
        });

        it('should successfully retrieve an organization user by appOrgId', async () => {
            const appOrgId = 'app-org-123';
            const createdUser = await userRepository.createOrganizationUser({
                name: 'Test Org',
                appOrgId,
            });

            const result = await loginUser.execute({ appOrgId });
            expect(result.getId()).toBe(createdUser.getId());
        });

        it('should throw an unauthorized error for a non-existent organization user', async () => {
            const appOrgId = 'non-existent-org';
            userRepository.findOrganizationUserByAppOrgId = jest
                .fn()
                .mockRejectedValue(new Error('user not found'));

            await expect(loginUser.execute({ appOrgId })).rejects.toThrow(
                'user not found'
            );
        });
    });

    describe('Required User Checks', () => {
        it('should throw an error if a required individual user is not found', async () => {
            userDefinition = {
                individualUserRequired: true,
                usePassword: false,
            };
            userRepository = new TestUserRepository({ userDefinition });
            userRepository.findIndividualUserByAppUserId = jest
                .fn()
                .mockRejectedValue(new Error('user not found'));
            loginUser = new LoginUser({
                userRepository,
                userConfig: userDefinition,
            });

            await expect(
                loginUser.execute({ appUserId: 'a-non-existent-user-id' })
            ).rejects.toThrow('user not found');
        });
    });
}); 