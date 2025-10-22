const { GetUserFromSharedSecret } = require('./get-user-from-shared-secret');
const { User } = require('../user');
const Boom = require('@hapi/boom');

describe('GetUserFromSharedSecret', () => {
    let getUserFromSharedSecret;
    let mockUserRepository;
    let mockUserConfig;

    beforeEach(() => {
        // Save original env
        process.env.FRIGG_API_KEY = 'test-secret-key';

        mockUserRepository = {
            findIndividualUserByAppUserId: jest.fn(),
            findOrganizationUserByAppOrgId: jest.fn(),
            createIndividualUser: jest.fn(),
            createOrganizationUser: jest.fn(),
        };

        mockUserConfig = {
            usePassword: false,
            primary: 'individual',
            individualUserRequired: true,
            organizationUserRequired: false,
        };

        getUserFromSharedSecret = new GetUserFromSharedSecret({
            userRepository: mockUserRepository,
            userConfig: mockUserConfig,
        });
    });

    afterEach(() => {
        delete process.env.FRIGG_API_KEY;
        jest.clearAllMocks();
    });

    describe('Secret Validation', () => {
        it('should throw 500 if FRIGG_API_KEY environment variable is not set', async () => {
            delete process.env.FRIGG_API_KEY;

            await expect(
                getUserFromSharedSecret.execute('any-secret', 'user123', null)
            ).rejects.toThrow(Boom.badImplementation('FRIGG_API_KEY environment variable is not configured'));
        });

        it('should throw 401 if provided secret is empty', async () => {
            await expect(
                getUserFromSharedSecret.execute('', 'user123', null)
            ).rejects.toThrow(Boom.unauthorized('Invalid API key'));
        });

        it('should throw 401 if provided secret is null', async () => {
            await expect(
                getUserFromSharedSecret.execute(null, 'user123', null)
            ).rejects.toThrow(Boom.unauthorized('Invalid API key'));
        });

        it('should throw 401 if provided secret does not match', async () => {
            await expect(
                getUserFromSharedSecret.execute('wrong-secret', 'user123', null)
            ).rejects.toThrow(Boom.unauthorized('Invalid API key'));
        });
    });

    describe('User Identifier Validation', () => {
        it('should throw 400 if both appUserId and appOrgId are missing', async () => {
            await expect(
                getUserFromSharedSecret.execute('test-secret-key', null, null)
            ).rejects.toThrow(
                Boom.badRequest('At least one of x-frigg-appuserid or x-frigg-apporgid headers is required')
            );
        });

        it('should throw 400 if both appUserId and appOrgId are empty strings', async () => {
            await expect(
                getUserFromSharedSecret.execute('test-secret-key', '', '')
            ).rejects.toThrow(
                Boom.badRequest('At least one of x-frigg-appuserid or x-frigg-apporgid headers is required')
            );
        });
    });

    describe('Authentication with appUserId', () => {
        it('should authenticate existing user with appUserId', async () => {
            const mockIndividualUser = {
                id: 'ind-user-1',
                appUserId: 'app-user-123',
                username: 'testuser',
            };

            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                mockIndividualUser
            );

            const result = await getUserFromSharedSecret.execute(
                'test-secret-key',
                'app-user-123',
                null
            );

            expect(result).toBeInstanceOf(User);
            expect(result.getAppUserId()).toBe('app-user-123');
            expect(mockUserRepository.findIndividualUserByAppUserId).toHaveBeenCalledWith(
                'app-user-123'
            );
            expect(mockUserRepository.createIndividualUser).not.toHaveBeenCalled();
        });

        it('should auto-create user if appUserId not found', async () => {
            const mockCreatedUser = {
                id: 'new-user-1',
                appUserId: 'new-user-456',
                username: 'api-user-new-user-456',
                email: 'new-user-456@api.local',
            };

            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(null);
            mockUserRepository.createIndividualUser.mockResolvedValue(mockCreatedUser);

            const result = await getUserFromSharedSecret.execute(
                'test-secret-key',
                'new-user-456',
                null
            );

            expect(result).toBeInstanceOf(User);
            expect(result.getAppUserId()).toBe('new-user-456');
            expect(mockUserRepository.createIndividualUser).toHaveBeenCalledWith({
                appUserId: 'new-user-456',
                username: 'api-user-new-user-456',
                email: 'new-user-456@api.local',
            });
        });
    });

    describe('Authentication with appOrgId', () => {
        beforeEach(() => {
            mockUserConfig.organizationUserRequired = true;
        });

        it('should authenticate existing org user with appOrgId', async () => {
            const mockOrgUser = {
                id: 'org-1',
                appOrgId: 'org-123',
            };

            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                mockOrgUser
            );

            const result = await getUserFromSharedSecret.execute(
                'test-secret-key',
                null,
                'org-123'
            );

            expect(result).toBeInstanceOf(User);
            expect(result.getAppOrgId()).toBe('org-123');
            expect(mockUserRepository.findOrganizationUserByAppOrgId).toHaveBeenCalledWith(
                'org-123'
            );
            expect(mockUserRepository.createOrganizationUser).not.toHaveBeenCalled();
        });

        it('should auto-create org user if appOrgId not found', async () => {
            const mockCreatedOrgUser = {
                id: 'new-org-1',
                appOrgId: 'new-org-456',
            };

            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(null);
            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(null);
            mockUserRepository.createOrganizationUser.mockResolvedValue(
                mockCreatedOrgUser
            );

            const result = await getUserFromSharedSecret.execute(
                'test-secret-key',
                null,
                'new-org-456'
            );

            expect(result).toBeInstanceOf(User);
            expect(result.getAppOrgId()).toBe('new-org-456');
            expect(mockUserRepository.createOrganizationUser).toHaveBeenCalledWith({
                appOrgId: 'new-org-456',
            });
        });
    });

    describe('Authentication with both appUserId and appOrgId', () => {
        beforeEach(() => {
            mockUserConfig.organizationUserRequired = true;
        });

        it('should authenticate when both IDs belong to same user', async () => {
            const mockOrgUser = {
                id: 'org-1',
                appOrgId: 'org-123',
            };

            const mockIndividualUser = {
                id: 'user-1',
                appUserId: 'user-123',
                organizationUser: 'org-1',
            };

            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                mockIndividualUser
            );
            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                mockOrgUser
            );

            const result = await getUserFromSharedSecret.execute(
                'test-secret-key',
                'user-123',
                'org-123'
            );

            expect(result).toBeInstanceOf(User);
            expect(result.getAppUserId()).toBe('user-123');
            expect(result.getAppOrgId()).toBe('org-123');
        });

        it('should throw 400 when both IDs refer to different users', async () => {
            const mockOrgUser = {
                id: 'org-1',
                appOrgId: 'org-123',
            };

            const mockIndividualUser = {
                id: 'user-1',
                appUserId: 'user-123',
                organizationUser: 'different-org',
            };

            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                mockIndividualUser
            );
            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                mockOrgUser
            );

            await expect(
                getUserFromSharedSecret.execute(
                    'test-secret-key',
                    'user-123',
                    'org-123'
                )
            ).rejects.toThrow(
                Boom.badRequest('User ID mismatch: x-frigg headers refer to different users')
            );
        });

        it('should handle when only individual user exists', async () => {
            const mockIndividualUser = {
                id: 'user-1',
                appUserId: 'user-123',
                organizationUser: null,
            };

            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                mockIndividualUser
            );
            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(null);

            const result = await getUserFromSharedSecret.execute(
                'test-secret-key',
                'user-123',
                'org-123'
            );

            expect(result).toBeInstanceOf(User);
            expect(result.getAppUserId()).toBe('user-123');
        });

        it('should handle when only org user exists', async () => {
            const mockOrgUser = {
                id: 'org-1',
                appOrgId: 'org-123',
            };

            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(null);
            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                mockOrgUser
            );

            const result = await getUserFromSharedSecret.execute(
                'test-secret-key',
                'user-123',
                'org-123'
            );

            expect(result).toBeInstanceOf(User);
            expect(result.getAppOrgId()).toBe('org-123');
        });
    });
});

