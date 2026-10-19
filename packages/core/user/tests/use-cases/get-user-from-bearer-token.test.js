const {
    GetUserFromBearerToken,
} = require('../../use-cases/get-user-from-bearer-token');
const { TestUserRepository } = require('../doubles/test-user-repository');

describe('GetUserFromBearerToken Use Case', () => {
    let userRepository;
    let getUserFromBearerToken;
    let userConfig;

    beforeEach(() => {
        userConfig = {
            usePassword: true,
            primary: 'individual',
            individualUserRequired: true,
            organizationUserRequired: false,
        };
        userRepository = new TestUserRepository({ userConfig });
        getUserFromBearerToken = new GetUserFromBearerToken({
            userRepository,
            userConfig
        });
    });

    it('should retrieve a user for a valid bearer token', async () => {
        const userId = 'user-123';
        const token = await userRepository.createToken(userId);
        const createdUserData = await userRepository.createIndividualUser({
            id: userId,
        });

        const user = await getUserFromBearerToken.execute(`Bearer ${token}`);

        expect(user).toBeDefined();
        expect(user.getId()).toBe(createdUserData.id);
    });

    it('should throw an unauthorized error if the bearer token is missing', async () => {
        await expect(getUserFromBearerToken.execute(null)).rejects.toThrow(
            'Missing Authorization Header'
        );
    });

    it('should throw an unauthorized error for an invalid token format', async () => {
        await expect(
            getUserFromBearerToken.execute('InvalidToken')
        ).rejects.toThrow('Invalid Token Format');
    });

    it('should throw an unauthorized error if the Session Token is not found', async () => {
        userRepository.getSessionToken = jest.fn().mockResolvedValue(null);
        await expect(
            getUserFromBearerToken.execute('Bearer invalid-token')
        ).rejects.toThrow('Session Token Not Found');
    });

    it('should throw an unauthorized error if the token is valid but finds no user', async () => {
        userRepository.getSessionToken = jest.fn().mockResolvedValue(null);
        const token = await userRepository.createToken('user-dne');
        await expect(
            getUserFromBearerToken.execute(`Bearer ${token}`)
        ).rejects.toThrow('Session Token Not Found');
    });

    describe('token owner resolution', () => {
        it('should look up the individual user by the token row userId', async () => {
            await userRepository.createIndividualUser({ id: 'first-user' });
            const owner = await userRepository.createIndividualUser({ id: 'second-user' });
            const token = await userRepository.createToken(owner.id);
            const findSpy = jest.spyOn(userRepository, 'findIndividualUserById');

            const user = await getUserFromBearerToken.execute(`Bearer ${token}`);

            expect(findSpy).toHaveBeenCalledWith(owner.id);
            expect(user.getId()).toBe(owner.id);
        });

        it('should look up the organization user by the token row userId', async () => {
            userConfig.primary = 'organization';
            await userRepository.createOrganizationUser({ id: 'first-org' });
            const owner = await userRepository.createOrganizationUser({ id: 'second-org' });
            const token = await userRepository.createToken(owner.id);
            const findSpy = jest.spyOn(userRepository, 'findOrganizationUserById');

            const user = await getUserFromBearerToken.execute(`Bearer ${token}`);

            expect(findSpy).toHaveBeenCalledWith(owner.id);
            expect(user.getId()).toBe(owner.id);
        });

        it('should fall back to the legacy user field on the token row', async () => {
            const owner = await userRepository.createIndividualUser({ id: 'legacy-user' });
            userRepository.getSessionToken = jest
                .fn()
                .mockResolvedValue({ id: 'token-1', user: owner.id });

            const user = await getUserFromBearerToken.execute('Bearer legacy-token');

            expect(user.getId()).toBe(owner.id);
        });

        it('should fail closed when the token row has no owner id', async () => {
            await userRepository.createIndividualUser({ id: 'first-user' });
            userRepository.getSessionToken = jest
                .fn()
                .mockResolvedValue({ id: 'token-1' });
            const findSpy = jest.spyOn(userRepository, 'findIndividualUserById');

            await expect(
                getUserFromBearerToken.execute('Bearer orphan-token')
            ).rejects.toThrow('Session Token Has No User');
            expect(findSpy).not.toHaveBeenCalled();
        });
    });
}); 