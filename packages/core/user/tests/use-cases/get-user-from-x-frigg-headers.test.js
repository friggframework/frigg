const Boom = require('@hapi/boom');
const { GetUserFromXFriggHeaders } = require('../../use-cases/get-user-from-x-frigg-headers');
const { User } = require('../../user');

describe('GetUserFromXFriggHeaders', () => {
    let getUserFromXFriggHeaders;
    let mockUserRepository;
    let mockUserConfig;

    beforeEach(() => {
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

        getUserFromXFriggHeaders = new GetUserFromXFriggHeaders({
            userRepository: mockUserRepository,
            userConfig: mockUserConfig,
        });
    });

    describe('Validation', () => {
        it('should throw 400 error when neither appUserId nor appOrgId provided', async () => {
            await expect(
                getUserFromXFriggHeaders.execute(null, null)
            ).rejects.toThrow(Boom.badRequest().message);

            await expect(
                getUserFromXFriggHeaders.execute(undefined, undefined)
            ).rejects.toThrow();
        });
    });

    describe('Find Existing User', () => {
        it('should find existing individual user by appUserId', async () => {
            const mockIndividualUser = {
                id: 'user-123',
                appUserId: 'app-user-456',
                username: 'testuser',
            };

            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                mockIndividualUser
            );

            const result = await getUserFromXFriggHeaders.execute(
                'app-user-456',
                null
            );

            expect(result).toBeInstanceOf(User);
            expect(
                mockUserRepository.findIndividualUserByAppUserId
            ).toHaveBeenCalledWith('app-user-456');
            expect(
                mockUserRepository.createIndividualUser
            ).not.toHaveBeenCalled();
        });

        it('should find existing organization user by appOrgId', async () => {
            mockUserConfig.organizationUserRequired = true;
            mockUserConfig.primary = 'organization';

            const mockOrgUser = {
                id: 'org-123',
                appOrgId: 'app-org-456',
            };

            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                mockOrgUser
            );

            const result = await getUserFromXFriggHeaders.execute(
                null,
                'app-org-456'
            );

            expect(result).toBeInstanceOf(User);
            expect(
                mockUserRepository.findOrganizationUserByAppOrgId
            ).toHaveBeenCalledWith('app-org-456');
            expect(
                mockUserRepository.createOrganizationUser
            ).not.toHaveBeenCalled();
        });
    });

    describe('Auto-create User', () => {
        it('should create new individual user when appUserId not found', async () => {
            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                null
            );

            const mockCreatedUser = {
                id: 'user-new',
                appUserId: 'new-app-user',
                username: 'app-user-new-app-user',
                email: 'new-app-user@app.local',
            };

            mockUserRepository.createIndividualUser.mockResolvedValue(
                mockCreatedUser
            );

            const result = await getUserFromXFriggHeaders.execute(
                'new-app-user',
                null
            );

            expect(result).toBeInstanceOf(User);
            expect(
                mockUserRepository.createIndividualUser
            ).toHaveBeenCalledWith({
                appUserId: 'new-app-user',
                username: 'app-user-new-app-user',
                email: 'new-app-user@app.local',
            });
        });

        it('should create new organization user when appOrgId not found', async () => {
            mockUserConfig.organizationUserRequired = true;
            mockUserConfig.primary = 'organization';
            mockUserConfig.individualUserRequired = false;

            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                null
            );

            const mockCreatedOrgUser = {
                id: 'org-new',
                appOrgId: 'new-app-org',
            };

            mockUserRepository.createOrganizationUser.mockResolvedValue(
                mockCreatedOrgUser
            );

            const result = await getUserFromXFriggHeaders.execute(
                null,
                'new-app-org'
            );

            expect(result).toBeInstanceOf(User);
            expect(
                mockUserRepository.createOrganizationUser
            ).toHaveBeenCalledWith({
                appOrgId: 'new-app-org',
            });
        });

        it('should auto-create organization user when individual exists but org user missing', async () => {
            // This is the critical scenario: primary is 'organization', both users are required,
            // individual user exists, but org user needs to be created
            mockUserConfig.primary = 'organization';
            mockUserConfig.organizationUserRequired = true;
            mockUserConfig.individualUserRequired = true;

            const mockIndividualUser = {
                id: 'user-123',
                appUserId: 'app-user-456',
            };

            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                mockIndividualUser
            );
            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                null
            );

            const mockCreatedOrgUser = {
                id: 'org-new',
                appOrgId: 'app-org-789',
            };

            mockUserRepository.createOrganizationUser.mockResolvedValue(
                mockCreatedOrgUser
            );

            const result = await getUserFromXFriggHeaders.execute(
                'app-user-456',
                'app-org-789'
            );

            expect(result).toBeInstanceOf(User);
            expect(mockUserRepository.createOrganizationUser).toHaveBeenCalledWith({
                appOrgId: 'app-org-789',
            });
            expect(result.getId()).toBeDefined();
            expect(result.getId()).not.toBeUndefined();
            // When primary is 'organization', getId() should return the org user's ID
            expect(result.getId()).toBe('org-new');
        });
    });

    describe('User ID Conflict Detection', () => {
        it('should throw 400 error when both IDs provided but belong to different users', async () => {
            const mockIndividualUser = {
                id: 'user-123',
                appUserId: 'app-user-456',
                organizationUser: 'org-999', // Different org
            };

            const mockOrgUser = {
                id: 'org-888', // Different ID
                appOrgId: 'app-org-789',
            };

            mockUserConfig.organizationUserRequired = true;

            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                mockIndividualUser
            );
            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                mockOrgUser
            );

            await expect(
                getUserFromXFriggHeaders.execute('app-user-456', 'app-org-789')
            ).rejects.toThrow(Boom.badRequest().message);

            await expect(
                getUserFromXFriggHeaders.execute('app-user-456', 'app-org-789')
            ).rejects.toThrow('User ID mismatch');
        });

        it('should succeed when both IDs provided and belong to same user', async () => {
            const mockOrgUser = {
                id: 'org-123',
                appOrgId: 'app-org-789',
            };

            const mockIndividualUser = {
                id: 'user-456',
                appUserId: 'app-user-456',
                organizationUser: 'org-123', // Matches org user
            };

            mockUserConfig.organizationUserRequired = true;

            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                mockIndividualUser
            );
            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                mockOrgUser
            );

            const result = await getUserFromXFriggHeaders.execute(
                'app-user-456',
                'app-org-789'
            );

            expect(result).toBeInstanceOf(User);
            expect(
                mockUserRepository.createIndividualUser
            ).not.toHaveBeenCalled();
            expect(
                mockUserRepository.createOrganizationUser
            ).not.toHaveBeenCalled();
        });

        it('should not validate conflict when only one ID provided', async () => {
            const mockIndividualUser = {
                id: 'user-123',
                appUserId: 'app-user-456',
            };

            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                mockIndividualUser
            );

            const result = await getUserFromXFriggHeaders.execute(
                'app-user-456',
                null
            );

            expect(result).toBeInstanceOf(User);
            expect(
                mockUserRepository.findOrganizationUserByAppOrgId
            ).not.toHaveBeenCalled();
        });
    });

    describe('User Config Respect', () => {
        it('should respect individualUserRequired setting', async () => {
            mockUserConfig.individualUserRequired = false;

            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                null
            );

            await getUserFromXFriggHeaders.execute('app-user-test', null);

            // Should not attempt to query or create individual user if not required
            expect(
                mockUserRepository.findIndividualUserByAppUserId
            ).not.toHaveBeenCalled();
        });

        it('should respect organizationUserRequired setting', async () => {
            mockUserConfig.organizationUserRequired = false;

            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                null
            );

            const mockIndividualUser = {
                id: 'user-123',
                appUserId: 'app-user-456',
            };

            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                mockIndividualUser
            );

            await getUserFromXFriggHeaders.execute('app-user-456', 'app-org-789');

            // Should not query org user if not required
            expect(
                mockUserRepository.findOrganizationUserByAppOrgId
            ).not.toHaveBeenCalled();
        });

        it('should respect primary user setting', async () => {
            mockUserConfig.primary = 'organization';
            mockUserConfig.organizationUserRequired = true;

            const mockOrgUser = {
                id: 'org-123',
                appOrgId: 'app-org-789',
            };

            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                mockOrgUser
            );

            const result = await getUserFromXFriggHeaders.execute(
                null,
                'app-org-789'
            );

            expect(result).toBeInstanceOf(User);
            // Verify User is constructed with org as primary
            expect(result.config.primary).toBe('organization');
        });
    });

    describe('Edge Cases', () => {
        it('should handle both IDs when only one user exists', async () => {
            const mockIndividualUser = {
                id: 'user-123',
                appUserId: 'app-user-456',
            };

            mockUserConfig.organizationUserRequired = true;

            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                mockIndividualUser
            );
            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                null
            );

            const result = await getUserFromXFriggHeaders.execute(
                'app-user-456',
                'app-org-789'
            );

            expect(result).toBeInstanceOf(User);
            // Should not throw conflict error when only one user found
        });

        it('should handle empty string IDs as falsy', async () => {
            await expect(
                getUserFromXFriggHeaders.execute('', '')
            ).rejects.toThrow();
        });
    });
});


