import { AuthenticateUser } from '../../user/use-cases/authenticate-user';
import { GetUserFromBearerToken } from '../../user/use-cases/get-user-from-bearer-token';
import { GetUserFromXFriggHeaders } from '../../user/use-cases/get-user-from-x-frigg-headers';
import { GetUserFromAdopterJwt } from '../../user/use-cases/get-user-from-adopter-jwt';
import { AuthenticateWithSharedSecret } from '../../user/use-cases/authenticate-with-shared-secret';
import { User } from '../../user/user';
import Boom from '@hapi/boom';

describe('AuthenticateUser - Multi-Mode Authentication', () => {
    let authenticateUser: AuthenticateUser;
    let mockGetUserFromBearerToken: any;
    let mockGetUserFromXFriggHeaders: any;
    let mockGetUserFromAdopterJwt: any;
    let mockAuthenticateWithSharedSecret: any;
    let mockUserConfig: any;
    let mockUser: any;

    beforeEach(() => {
        mockUser = new User(
            { id: 'user-123', username: 'testuser', appUserId: 'app-user-123' },
            { id: 'org-123', appOrgId: 'app-org-456' },
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

        mockAuthenticateWithSharedSecret = {
            execute: jest.fn().mockResolvedValue(true),
        };

        mockUserConfig = {
            authModes: {
                friggToken: true,
                sharedSecret: false,
                adopterJwt: false,
            },
        };

        authenticateUser = new AuthenticateUser({
            getUserFromBearerToken: mockGetUserFromBearerToken,
            getUserFromXFriggHeaders: mockGetUserFromXFriggHeaders,
            getUserFromAdopterJwt: mockGetUserFromAdopterJwt,
            authenticateWithSharedSecret: mockAuthenticateWithSharedSecret,
            userConfig: mockUserConfig,
        });
    });

    describe('Priority 1: Shared Secret (Backend-to-Backend with API Key)', () => {
        beforeEach(() => {
            mockUserConfig.authModes.sharedSecret = true;
        });

        it('should authenticate with x-frigg-api-key and appUserId', async () => {
            const mockReq = {
                headers: {
                    'x-frigg-api-key': 'secret-key',
                    'x-frigg-appuserid': 'app-user-123',
                },
            };

            const result = await authenticateUser.execute(mockReq as any);

            expect(result).toBe(mockUser);
            expect(mockAuthenticateWithSharedSecret.execute).toHaveBeenCalledWith('secret-key');
            expect(mockGetUserFromXFriggHeaders.execute).toHaveBeenCalledWith(
                'app-user-123',
                undefined
            );
            expect(mockGetUserFromBearerToken.execute).not.toHaveBeenCalled();
        });

        it('should authenticate with x-frigg-api-key and appOrgId', async () => {
            const mockReq = {
                headers: {
                    'x-frigg-api-key': 'secret-key',
                    'x-frigg-apporgid': 'app-org-456',
                },
            };

            const result = await authenticateUser.execute(mockReq as any);

            expect(result).toBe(mockUser);
            expect(mockAuthenticateWithSharedSecret.execute).toHaveBeenCalledWith('secret-key');
            expect(mockGetUserFromXFriggHeaders.execute).toHaveBeenCalledWith(
                undefined,
                'app-org-456'
            );
        });

        it('should authenticate with x-frigg-api-key and both user IDs', async () => {
            const mockReq = {
                headers: {
                    'x-frigg-api-key': 'secret-key',
                    'x-frigg-appuserid': 'app-user-123',
                    'x-frigg-apporgid': 'app-org-456',
                },
            };

            const result = await authenticateUser.execute(mockReq as any);

            expect(result).toBe(mockUser);
            expect(mockAuthenticateWithSharedSecret.execute).toHaveBeenCalledWith('secret-key');
            expect(mockGetUserFromXFriggHeaders.execute).toHaveBeenCalledWith(
                'app-user-123',
                'app-org-456'
            );
        });

        it('should skip shared secret when authModes.sharedSecret is false', async () => {
            mockUserConfig.authModes.sharedSecret = false;

            const mockReq = {
                headers: {
                    'x-frigg-api-key': 'secret-key',
                    'x-frigg-appuserid': 'app-user-123',
                    authorization: 'Bearer token',
                },
            };

            await authenticateUser.execute(mockReq as any);

            expect(mockAuthenticateWithSharedSecret.execute).not.toHaveBeenCalled();
            expect(mockGetUserFromBearerToken.execute).toHaveBeenCalled();
        });

        it('should prioritize shared secret over JWT and Frigg token', async () => {
            mockUserConfig.authModes.adopterJwt = true;

            const mockReq = {
                headers: {
                    'x-frigg-api-key': 'secret-key',
                    'x-frigg-appuserid': 'app-user-123',
                    authorization: 'Bearer jwt.part.here',
                },
            };

            await authenticateUser.execute(mockReq as any);

            expect(mockAuthenticateWithSharedSecret.execute).toHaveBeenCalled();
            expect(mockGetUserFromAdopterJwt.execute).not.toHaveBeenCalled();
            expect(mockGetUserFromBearerToken.execute).not.toHaveBeenCalled();
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

            await authenticateUser.execute(mockReq as any);

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

            await authenticateUser.execute(mockReq as any);

            expect(mockGetUserFromAdopterJwt.execute).not.toHaveBeenCalled();
            expect(mockGetUserFromBearerToken.execute).toHaveBeenCalledWith(
                'Bearer simple-token'
            );
        });

        it('should validate x-frigg headers match JWT user when both present', async () => {
            const mockReq = {
                headers: {
                    authorization: 'Bearer eyJhbGci.eyJzdWIi.signature',
                    'x-frigg-appuserid': 'app-user-123',
                },
            };

            await authenticateUser.execute(mockReq as any);

            expect(mockGetUserFromAdopterJwt.execute).toHaveBeenCalledWith(
                'eyJhbGci.eyJzdWIi.signature'
            );
        });

        it('should throw forbidden when x-frigg-appuserid does not match JWT user', async () => {
            const mockReq = {
                headers: {
                    authorization: 'Bearer eyJhbGci.eyJzdWIi.signature',
                    'x-frigg-appuserid': 'different-user',
                },
            };

            await expect(authenticateUser.execute(mockReq as any)).rejects.toThrow(
                Boom.forbidden('x-frigg-appuserid header does not match authenticated user')
            );
        });

        it('should throw forbidden when x-frigg-apporgid does not match JWT user', async () => {
            const mockReq = {
                headers: {
                    authorization: 'Bearer eyJhbGci.eyJzdWIi.signature',
                    'x-frigg-apporgid': 'different-org',
                },
            };

            await expect(authenticateUser.execute(mockReq as any)).rejects.toThrow(
                Boom.forbidden('x-frigg-apporgid header does not match authenticated user')
            );
        });

        it('should not try JWT when authModes.adopterJwt is false', async () => {
            mockUserConfig.authModes.adopterJwt = false;

            const mockReq = {
                headers: {
                    authorization: 'Bearer eyJhbGci.eyJzdWIi.signature',
                },
            };

            await authenticateUser.execute(mockReq as any);

            expect(mockGetUserFromAdopterJwt.execute).not.toHaveBeenCalled();
            expect(mockGetUserFromBearerToken.execute).toHaveBeenCalledWith(
                'Bearer eyJhbGci.eyJzdWIi.signature'
            );
        });
    });

    describe('Priority 3: Frigg Native Token (Fallback)', () => {
        it('should fall back to Frigg token when no other auth present', async () => {
            const mockReq = {
                headers: {
                    authorization: 'Bearer frigg-token-123',
                },
            };

            const result = await authenticateUser.execute(mockReq as any);

            expect(result).toBe(mockUser);
            expect(mockGetUserFromBearerToken.execute).toHaveBeenCalledWith(
                'Bearer frigg-token-123'
            );
            expect(mockAuthenticateWithSharedSecret.execute).not.toHaveBeenCalled();
        });

        it('should validate x-frigg headers match Frigg token user when both present', async () => {
            const mockReq = {
                headers: {
                    authorization: 'Bearer frigg-token-123',
                    'x-frigg-appuserid': 'app-user-123',
                },
            };

            await authenticateUser.execute(mockReq as any);

            expect(mockGetUserFromBearerToken.execute).toHaveBeenCalledWith(
                'Bearer frigg-token-123'
            );
        });

        it('should throw forbidden when x-frigg-appuserid does not match Frigg token user', async () => {
            const mockReq = {
                headers: {
                    authorization: 'Bearer frigg-token-123',
                    'x-frigg-appuserid': 'different-user',
                },
            };

            await expect(authenticateUser.execute(mockReq as any)).rejects.toThrow(
                Boom.forbidden('x-frigg-appuserid header does not match authenticated user')
            );
        });

        it('should throw forbidden when x-frigg-apporgid does not match Frigg token user', async () => {
            const mockReq = {
                headers: {
                    authorization: 'Bearer frigg-token-123',
                    'x-frigg-apporgid': 'different-org',
                },
            };

            await expect(authenticateUser.execute(mockReq as any)).rejects.toThrow(
                Boom.forbidden('x-frigg-apporgid header does not match authenticated user')
            );
        });

        it('should skip Frigg token when authModes.friggToken is false', async () => {
            mockUserConfig.authModes.friggToken = false;

            const mockReq = {
                headers: {
                    authorization: 'Bearer frigg-token-123',
                },
            };

            await expect(authenticateUser.execute(mockReq as any)).rejects.toThrow(
                'No valid authentication provided'
            );

            expect(mockGetUserFromBearerToken.execute).not.toHaveBeenCalled();
        });
    });

    describe('Priority Ordering', () => {
        it('should prioritize shared secret over JWT over Frigg token', async () => {
            mockUserConfig.authModes.sharedSecret = true;
            mockUserConfig.authModes.adopterJwt = true;

            const mockReq = {
                headers: {
                    'x-frigg-api-key': 'secret-key',
                    'x-frigg-appuserid': 'app-user-123',
                    authorization: 'Bearer jwt.token.here',
                },
            };

            await authenticateUser.execute(mockReq as any);

            expect(mockAuthenticateWithSharedSecret.execute).toHaveBeenCalled();
            expect(mockGetUserFromAdopterJwt.execute).not.toHaveBeenCalled();
            expect(mockGetUserFromBearerToken.execute).not.toHaveBeenCalled();
        });

        it('should try JWT before Frigg token when JWT enabled', async () => {
            mockUserConfig.authModes.adopterJwt = true;

            const mockReq = {
                headers: {
                    authorization: 'Bearer part1.part2.part3',
                },
            };

            await authenticateUser.execute(mockReq as any);

            expect(mockGetUserFromAdopterJwt.execute).toHaveBeenCalledWith(
                'part1.part2.part3'
            );
            expect(mockGetUserFromBearerToken.execute).not.toHaveBeenCalled();
        });

        it('should fall back to Frigg token when shared secret not present', async () => {
            mockUserConfig.authModes.sharedSecret = true;

            const mockReq = {
                headers: {
                    authorization: 'Bearer frigg-token',
                },
            };

            await authenticateUser.execute(mockReq as any);

            expect(mockAuthenticateWithSharedSecret.execute).not.toHaveBeenCalled();
            expect(mockGetUserFromBearerToken.execute).toHaveBeenCalled();
        });
    });

    describe('Auth Mode Configuration', () => {
        it('should use default friggToken mode when authModes not configured', async () => {
            const authWithDefaults = new AuthenticateUser({
                getUserFromBearerToken: mockGetUserFromBearerToken,
                getUserFromXFriggHeaders: mockGetUserFromXFriggHeaders,
                getUserFromAdopterJwt: mockGetUserFromAdopterJwt,
                authenticateWithSharedSecret: mockAuthenticateWithSharedSecret,
                userConfig: {},
            });

            const mockReq = {
                headers: {
                    authorization: 'Bearer token',
                },
            };

            await authWithDefaults.execute(mockReq as any);

            expect(mockGetUserFromBearerToken.execute).toHaveBeenCalled();
        });

        it('should throw unauthorized when no valid authentication provided', async () => {
            const mockReq = {
                headers: {},
            };

            await expect(authenticateUser.execute(mockReq as any)).rejects.toThrow(
                'No valid authentication provided'
            );
        });

        it('should throw unauthorized when all auth modes disabled', async () => {
            mockUserConfig.authModes = {
                friggToken: false,
                sharedSecret: false,
                adopterJwt: false,
            };

            const mockReq = {
                headers: {
                    authorization: 'Bearer token',
                },
            };

            await expect(authenticateUser.execute(mockReq as any)).rejects.toThrow(
                'No valid authentication provided'
            );
        });
    });

    describe('Validation Logic', () => {
        it('should allow x-frigg headers without additional validation for shared secret', async () => {
            mockUserConfig.authModes.sharedSecret = true;

            const mockReq = {
                headers: {
                    'x-frigg-api-key': 'secret-key',
                    'x-frigg-appuserid': 'any-user',
                },
            };

            await authenticateUser.execute(mockReq as any);

            expect(mockAuthenticateWithSharedSecret.execute).toHaveBeenCalled();
            expect(mockGetUserFromXFriggHeaders.execute).toHaveBeenCalled();
        });

        it('should validate when both JWT and x-frigg headers present', async () => {
            mockUserConfig.authModes.adopterJwt = true;

            const mockReq = {
                headers: {
                    authorization: 'Bearer jwt.token.here',
                    'x-frigg-appuserid': 'app-user-123',
                    'x-frigg-apporgid': 'app-org-456',
                },
            };

            await authenticateUser.execute(mockReq as any);

            expect(mockGetUserFromAdopterJwt.execute).toHaveBeenCalled();
        });

        it('should pass validation when x-frigg headers match authenticated user', async () => {
            const mockReq = {
                headers: {
                    authorization: 'Bearer frigg-token',
                    'x-frigg-appuserid': 'app-user-123',
                    'x-frigg-apporgid': 'app-org-456',
                },
            };

            const result = await authenticateUser.execute(mockReq as any);

            expect(result).toBe(mockUser);
        });
    });

    describe('Error Handling', () => {
        it('should propagate authentication errors from shared secret', async () => {
            mockUserConfig.authModes.sharedSecret = true;

            const mockReq = {
                headers: {
                    'x-frigg-api-key': 'wrong-key',
                    'x-frigg-appuserid': 'user-123',
                },
            };

            const customError = Boom.unauthorized('Invalid API key');
            mockAuthenticateWithSharedSecret.execute.mockRejectedValue(customError);

            await expect(authenticateUser.execute(mockReq as any)).rejects.toThrow(
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

            await expect(authenticateUser.execute(mockReq as any)).rejects.toThrow(
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

            await expect(authenticateUser.execute(mockReq as any)).rejects.toThrow(
                notImplementedError
            );
        });
    });
});
