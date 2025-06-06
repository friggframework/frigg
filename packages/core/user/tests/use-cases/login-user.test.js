const bcrypt = require('bcryptjs');
const { LoginUser } = require('../../use-cases/login-user');
const { TestUserRepository } = require('../doubles/test-user-repository');
const { UserFactory } = require('../../user-factory'); // Using the real factory, it's simple enough

// Mocking the bcrypt library
jest.mock('bcryptjs', () => ({
    compareSync: jest.fn(),
}));

describe('LoginUser Use Case', () => {
    let userRepository;
    let userFactory;
    let loginUser;

    beforeEach(() => {
        userRepository = new TestUserRepository();
        userFactory = new UserFactory();
        loginUser = new LoginUser({ userRepository, userFactory });

        // Reset mocks before each test
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

            const result = await loginUser.execute({ username, password });

            expect(bcrypt.compareSync).toHaveBeenCalledWith(password, hashword);
            expect(result).toBeDefined();
            expect(result.individualUser.username).toBe(username);
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
            // Reconfigure the use case to not use passwords
            const userFactoryNoPassword = {
                create: () => new userFactory.userModel({ usePassword: false }),
            };
            loginUser = new LoginUser({
                userRepository,
                userFactory: userFactoryNoPassword,
            });
        });

        it('should successfully retrieve a user by appUserId', async () => {
            const appUserId = 'app-user-123';
            const createdUser = await userRepository.createIndividualUser({
                appUserId,
            });

            const result = await loginUser.execute({ appUserId });
            expect(result.individualUser.appUserId).toBe(appUserId);
        });
    });

    describe('Required User Checks', () => {
        it('should throw an error if a required individual user is not found', async () => {
            const userFactoryRequired = {
                create: () =>
                    new userFactory.userModel({ individualUserRequired: true }),
            };
            loginUser = new LoginUser({
                userRepository,
                userFactory: userFactoryRequired,
            });

            await expect(loginUser.execute({ username: 'dne' })).rejects.toThrow('user not found');
        });
    });
}); 