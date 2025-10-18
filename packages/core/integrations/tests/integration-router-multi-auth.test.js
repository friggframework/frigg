const { AuthenticateUser } = require('../../user/use-cases/authenticate-user');
const { GetUserFromBearerToken } = require('../../user/use-cases/get-user-from-bearer-token');
const { GetUserFromXFriggHeaders } = require('../../user/use-cases/get-user-from-x-frigg-headers');
const { GetUserFromAdopterJwt } = require('../../user/use-cases/get-user-from-adopter-jwt');
const { User } = require('../../user/user');
const Boom = require('@hapi/boom');

describe('AuthenticateUser - Multi-Mode Authentication', () => {
    let authenticateUser;
    let mockGetUserFromBearerToken;
    let mockGetUserFromXFriggHeaders;
    let mockGetUserFromAdopterJwt;
    let mockUserConfig;
    let mockUser;

    beforeEach(() => {
        mockUser = new User(
            { id: 'user-123', username: 'testuser' },
            null,
            false,
            'individual',
            true,
            false
        );

        mockGetUserFromBearerToken = {
            execute: jest.fn().mockResolvedValue(mockUser),
        };

        mockGetUserFromXFriggHeaders = {
            execute: jest.fn().mockResolvedValue(mockUser),
        };

        mockGetUserFromAdopterJwt = {
            execute: jest.fn().mockResolvedValue(mockUser),
        };

        mockUserConfig = {
            authModes: {
                friggToken: true,
                xFriggHeaders: true,
                adopterJwt: false,
            },
        };

        authenticateUser = new AuthenticateUser({
            getUserFromBearerToken: mockGetUserFromBearerToken,
            getUserFromXFriggHeaders: mockGetUserFromXFriggHeaders,
            getUserFromAdopterJwt: mockGetUserFromAdopterJwt,
            userConfig: mockUserConfig,
        });
    });

    describe('Priority 1: X-Frigg Headers (Backend-to-Backend)', () => {
        it('should authenticate with x-frigg-appUserId header', async () => {
            const mockReq = {
                headers: {
                    'x-frigg-appuserid': 'app-user-123',
                },
            };

            const result = await authenticateUser.execute(mockReq);

            expect(result).toBe(mockUser);
            expect(mockGetUserFromXFriggHeaders.execute).toHaveBeenCalledWith(
                'app-user-123',
                undefined
            );
            expect(mockGetUserFromBearerToken.execute).not.toHaveBeenCalled();
        });

        it('should authenticate with x-frigg-appOrgId header', async () => {
            const mockReq = {
                headers: {
                    'x-frigg-apporgid': 'app-org-456',
                },
            };

            const result = await authenticateUser.execute(mockReq);

            expect(result).toBe(mockUser);
            expect(mockGetUserFromXFriggHeaders.execute).toHaveBeenCalledWith(
                undefined,
                'app-org-456'
            );
            expect(mockGetUserFromBearerToken.execute).not.toHaveBeenCalled();
        });

        it('should authenticate with both x-frigg headers when they match', async () => {
            const mockReq = {
                headers: {
                    'x-frigg-appuserid': 'app-user-123',
                    'x-frigg-apporgid': 'app-org-456',
                },
            };

            const result = await authenticateUser.execute(mockReq);

            expect(result).toBe(mockUser);
            expect(mockGetUserFromXFriggHeaders.execute).toHaveBeenCalledWith(
                'app-user-123',
                'app-org-456'
            );
        });

        it('should reject conflicting x-frigg headers (delegated to use case)', async () => {
            const mockReq = {
                headers: {
                    'x-frigg-appuserid': 'app-user-123',
                    'x-frigg-apporgid': 'app-org-999',
                },
            };

            const conflictError = Boom.badRequest('User ID mismatch');
            mockGetUserFromXFriggHeaders.execute.mockRejectedValue(conflictError);

            await expect(authenticateUser.execute(mockReq)).rejects.toThrow(
                conflictError
            );
        });

        it('should skip x-frigg headers when authModes.xFriggHeaders is false', async () => {
            mockUserConfig.authModes.xFriggHeaders = false;

            const mockReq = {
                headers: {
                    'x-frigg-appuserid': 'app-user-123',
                    authorization: 'Bearer frigg-token-xyz',
                },
            };

            await authenticateUser.execute(mockReq);

            expect(mockGetUserFromXFriggHeaders.execute).not.toHaveBeenCalled();
            expect(mockGetUserFromBearerToken.execute).toHaveBeenCalledWith(
                'Bearer frigg-token-xyz'
            );
        });
    });

    describe('Priority 2: Adopter JWT', () => {
        beforeEach(() => {
            mockUserConfig.authModes.adopterJwt = true;
        });

        it('should try JWT when enabled and Bearer token is 3-part format', async () => {
            const mockReq = {
                headers: {
                    authorization: 'Bearer eyJhbGci.eyJzdWIi.signature',
                },
            };

            await authenticateUser.execute(mockReq);

            expect(mockGetUserFromAdopterJwt.execute).toHaveBeenCalledWith(
                'eyJhbGci.eyJzdWIi.signature'
            );
            expect(mockGetUserFromBearerToken.execute).not.toHaveBeenCalled();
        });

        it('should fall back to Frigg token when Bearer token is not JWT format', async () => {
            const mockReq = {
                headers: {
                    authorization: 'Bearer simple-token',
                },
            };

            await authenticateUser.execute(mockReq);

            expect(mockGetUserFromAdopterJwt.execute).not.toHaveBeenCalled();
            expect(mockGetUserFromBearerToken.execute).toHaveBeenCalledWith(
                'Bearer simple-token'
            );
        });

        it('should not try JWT when authModes.adopterJwt is false', async () => {
            mockUserConfig.authModes.adopterJwt = false;

            const mockReq = {
                headers: {
                    authorization: 'Bearer eyJhbGci.eyJzdWIi.signature',
                },
            };

            await authenticateUser.execute(mockReq);

            expect(mockGetUserFromAdopterJwt.execute).not.toHaveBeenCalled();
            expect(mockGetUserFromBearerToken.execute).toHaveBeenCalledWith(
                'Bearer eyJhbGci.eyJzdWIi.signature'
            );
        });
    });

    describe('Priority 3: Frigg Native Token (Fallback)', () => {
        it('should fall back to Frigg token when no x-frigg headers', async () => {
            const mockReq = {
                headers: {
                    authorization: 'Bearer frigg-token-123',
                },
            };

            const result = await authenticateUser.execute(mockReq);

            expect(result).toBe(mockUser);
            expect(mockGetUserFromBearerToken.execute).toHaveBeenCalledWith(
                'Bearer frigg-token-123'
            );
            expect(mockGetUserFromXFriggHeaders.execute).not.toHaveBeenCalled();
        });

        it('should skip Frigg token when authModes.friggToken is false', async () => {
            mockUserConfig.authModes.friggToken = false;

            const mockReq = {
                headers: {
                    authorization: 'Bearer frigg-token-123',
                },
            };

            await expect(authenticateUser.execute(mockReq)).rejects.toThrow(
                Boom.unauthorized().message
            );

            expect(mockGetUserFromBearerToken.execute).not.toHaveBeenCalled();
        });
    });

    describe('Priority Ordering', () => {
        it('should prioritize x-frigg headers over bearer token', async () => {
            const mockReq = {
                headers: {
                    'x-frigg-appuserid': 'app-user-123',
                    authorization: 'Bearer frigg-token-xyz',
                },
            };

            await authenticateUser.execute(mockReq);

            expect(mockGetUserFromXFriggHeaders.execute).toHaveBeenCalledWith(
                'app-user-123',
                undefined
            );
            expect(mockGetUserFromBearerToken.execute).not.toHaveBeenCalled();
        });

        it('should try JWT before Frigg token when JWT enabled', async () => {
            mockUserConfig.authModes.adopterJwt = true;

            const mockReq = {
                headers: {
                    authorization: 'Bearer part1.part2.part3',
                },
            };

            await authenticateUser.execute(mockReq);

            expect(mockGetUserFromAdopterJwt.execute).toHaveBeenCalledWith(
                'part1.part2.part3'
            );
            expect(mockGetUserFromBearerToken.execute).not.toHaveBeenCalled();
        });
    });

    describe('Auth Mode Configuration', () => {
        it('should use default friggToken mode when authModes not configured', () => {
            const authWithDefaults = new AuthenticateUser({
                getUserFromBearerToken: mockGetUserFromBearerToken,
                getUserFromXFriggHeaders: mockGetUserFromXFriggHeaders,
                getUserFromAdopterJwt: mockGetUserFromAdopterJwt,
                userConfig: {}, // No authModes
            });

            const mockReq = {
                headers: {
                    authorization: 'Bearer token',
                },
            };

            authWithDefaults.execute(mockReq);

            expect(mockGetUserFromBearerToken.execute).toHaveBeenCalled();
        });

        it('should throw unauthorized when no valid authentication provided', async () => {
            const mockReq = {
                headers: {},
            };

            await expect(authenticateUser.execute(mockReq)).rejects.toThrow(
                Boom.unauthorized().message
            );

            await expect(authenticateUser.execute(mockReq)).rejects.toThrow(
                'No valid authentication provided'
            );
        });

        it('should throw unauthorized when all auth modes disabled', async () => {
            mockUserConfig.authModes = {
                friggToken: false,
                xFriggHeaders: false,
                adopterJwt: false,
            };

            const mockReq = {
                headers: {
                    authorization: 'Bearer token',
                },
            };

            await expect(authenticateUser.execute(mockReq)).rejects.toThrow(
                'No valid authentication provided'
            );
        });
    });

    describe('Error Handling', () => {
        it('should propagate authentication errors from x-frigg headers', async () => {
            const mockReq = {
                headers: {
                    'x-frigg-appuserid': 'invalid-user',
                },
            };

            const customError = Boom.badRequest('Invalid user ID');
            mockGetUserFromXFriggHeaders.execute.mockRejectedValue(customError);

            await expect(authenticateUser.execute(mockReq)).rejects.toThrow(
                customError
            );
        });

        it('should propagate authentication errors from bearer token', async () => {
            const mockReq = {
                headers: {
                    authorization: 'Bearer invalid-token',
                },
            };

            const customError = Boom.unauthorized('Invalid token');
            mockGetUserFromBearerToken.execute.mockRejectedValue(customError);

            await expect(authenticateUser.execute(mockReq)).rejects.toThrow(
                customError
            );
        });

        it('should propagate not implemented error from JWT', async () => {
            mockUserConfig.authModes.adopterJwt = true;

            const mockReq = {
                headers: {
                    authorization: 'Bearer part1.part2.part3',
                },
            };

            const notImplementedError = Boom.notImplemented('JWT not implemented');
            mockGetUserFromAdopterJwt.execute.mockRejectedValue(
                notImplementedError
            );

            await expect(authenticateUser.execute(mockReq)).rejects.toThrow(
                notImplementedError
            );
        });
    });
});


