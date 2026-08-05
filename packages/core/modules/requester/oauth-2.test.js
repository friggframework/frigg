const { OAuth2Requester } = require('./oauth-2');

describe('OAuth2Requester', () => {
    describe('constructor', () => {
        it('should set grant_type to authorization_code by default', () => {
            const requester = new OAuth2Requester({});
            expect(requester.grant_type).toBe('authorization_code');
        });

        it('should set grant_type from params', () => {
            const requester = new OAuth2Requester({
                grant_type: 'client_credentials',
            });
            expect(requester.grant_type).toBe('client_credentials');
        });

        it('should set isRefreshable to true', () => {
            const requester = new OAuth2Requester({});
            expect(requester.isRefreshable).toBe(true);
        });
    });

    describe('DLGT_INVALID_AUTH payload', () => {
        it('forwards the failure from getTokenFromUsernamePassword', async () => {
            const requester = new OAuth2Requester({
                grant_type: 'password',
                username: 'someone',
                password: 'wrong',
            });
            const failure = Object.assign(new Error('bad password'), {
                statusCode: 401,
            });
            requester._post = jest.fn().mockRejectedValue(failure);
            requester.notify = jest.fn();

            await requester.getTokenFromUsernamePassword();

            expect(requester.notify).toHaveBeenCalledWith(
                requester.DLGT_INVALID_AUTH,
                failure
            );
        });

        it('forwards the failure from getTokenFromClientCredentials', async () => {
            const requester = new OAuth2Requester({
                grant_type: 'client_credentials',
            });
            const failure = Object.assign(new Error('bad client secret'), {
                statusCode: 401,
            });
            requester._post = jest.fn().mockRejectedValue(failure);
            requester.notify = jest.fn();

            await requester.getTokenFromClientCredentials();

            expect(requester.notify).toHaveBeenCalledWith(
                requester.DLGT_INVALID_AUTH,
                failure
            );
        });
    });

    describe('refreshAuth', () => {
        it('should call refreshAccessToken for authorization_code grant type', async () => {
            const requester = new OAuth2Requester({
                grant_type: 'authorization_code',
                refresh_token: 'test-refresh-token',
            });
            requester.refreshAccessToken = jest.fn().mockResolvedValue({
                access_token: 'new-token',
            });

            const result = await requester.refreshAuth();

            expect(result).toBe(true);
            expect(requester.refreshAccessToken).toHaveBeenCalledWith({
                refresh_token: 'test-refresh-token',
            });
        });

        it('should call refreshAccessToken for password grant type', async () => {
            const requester = new OAuth2Requester({
                grant_type: 'password',
                refresh_token: 'test-refresh-token',
            });
            requester.refreshAccessToken = jest.fn().mockResolvedValue({
                access_token: 'new-token',
            });

            const result = await requester.refreshAuth();

            expect(result).toBe(true);
            expect(requester.refreshAccessToken).toHaveBeenCalledWith({
                refresh_token: 'test-refresh-token',
            });
        });

        it('should call getTokenFromClientCredentials for client_credentials grant type', async () => {
            const requester = new OAuth2Requester({
                grant_type: 'client_credentials',
            });
            requester.getTokenFromClientCredentials = jest
                .fn()
                .mockResolvedValue({
                    access_token: 'new-token',
                });
            requester.refreshAccessToken = jest.fn();

            const result = await requester.refreshAuth();

            expect(result).toBe(true);
            expect(requester.getTokenFromClientCredentials).toHaveBeenCalled();
            expect(requester.refreshAccessToken).not.toHaveBeenCalled();
        });

        it('should return false and notify DLGT_INVALID_AUTH on error during refresh', async () => {
            const requester = new OAuth2Requester({
                grant_type: 'authorization_code',
                refresh_token: 'test-refresh-token',
            });
            requester.refreshAccessToken = jest
                .fn()
                .mockRejectedValue(new Error('Token expired'));
            requester.notify = jest.fn();

            const result = await requester.refreshAuth();

            expect(result).toBe(false);
            expect(requester.notify).toHaveBeenCalledWith(
                requester.DLGT_INVALID_AUTH
            );
        });

        it('should return false and notify DLGT_INVALID_AUTH on error during client_credentials refresh', async () => {
            const requester = new OAuth2Requester({
                grant_type: 'client_credentials',
            });
            requester.getTokenFromClientCredentials = jest
                .fn()
                .mockRejectedValue(new Error('Invalid credentials'));
            requester.notify = jest.fn();

            const result = await requester.refreshAuth();

            expect(result).toBe(false);
            expect(requester.notify).toHaveBeenCalledWith(
                requester.DLGT_INVALID_AUTH
            );
        });
    });

    describe('setTokens', () => {
        it('should set access_token and refresh_token', async () => {
            const requester = new OAuth2Requester({});
            requester.notify = jest.fn();

            await requester.setTokens({
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token',
                expires_in: 3600,
            });

            expect(requester.access_token).toBe('test-access-token');
            expect(requester.refresh_token).toBe('test-refresh-token');
            expect(requester.notify).toHaveBeenCalledWith(
                requester.DLGT_TOKEN_UPDATE
            );
        });
    });

    describe('addAuthHeaders', () => {
        it('should add Authorization header when access_token is set', async () => {
            const requester = new OAuth2Requester({
                access_token: 'test-token',
            });
            const headers = {};

            await requester.addAuthHeaders(headers);

            expect(headers.Authorization).toBe('Bearer test-token');
        });

        it('should not add Authorization header when access_token is not set', async () => {
            const requester = new OAuth2Requester({});
            const headers = {};

            await requester.addAuthHeaders(headers);

            expect(headers.Authorization).toBeUndefined();
        });

        it('should clear existing Authorization header when access_token is not set', async () => {
            const requester = new OAuth2Requester({});
            const headers = { Authorization: 'Bearer old-stale-token' };

            await requester.addAuthHeaders(headers);

            expect(headers.Authorization).toBeUndefined();
        });

        it('should replace existing Authorization header with new token', async () => {
            const requester = new OAuth2Requester({
                access_token: 'new-token',
            });
            const headers = { Authorization: 'Bearer old-stale-token' };

            await requester.addAuthHeaders(headers);

            expect(headers.Authorization).toBe('Bearer new-token');
        });
    });

    describe('getAuthorizationRequirements', () => {
        it('should return authorization requirements with url and type', () => {
            const requester = new OAuth2Requester({
                authorizationUri: 'https://example.com/oauth/authorize',
            });

            const requirements = requester.getAuthorizationRequirements();

            expect(requirements).toEqual({
                url: 'https://example.com/oauth/authorize',
                type: 'oauth2',
            });
        });
    });

    describe('isAuthenticated', () => {
        it('should return true when all required properties are set', () => {
            const requester = new OAuth2Requester({
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token',
                accessTokenExpire: new Date(Date.now() + 3600000),
                refreshTokenExpire: new Date(Date.now() + 86400000),
            });

            expect(requester.isAuthenticated()).toBe(true);
        });

        it('should return false when access_token is null', () => {
            const requester = new OAuth2Requester({
                refresh_token: 'test-refresh-token',
                accessTokenExpire: new Date(Date.now() + 3600000),
                refreshTokenExpire: new Date(Date.now() + 86400000),
            });

            expect(requester.isAuthenticated()).toBe(false);
        });

        it('should return false when refresh_token is null', () => {
            const requester = new OAuth2Requester({
                access_token: 'test-access-token',
                accessTokenExpire: new Date(Date.now() + 3600000),
                refreshTokenExpire: new Date(Date.now() + 86400000),
            });

            expect(requester.isAuthenticated()).toBe(false);
        });

        it('should return false when accessTokenExpire is not set', () => {
            const requester = new OAuth2Requester({
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token',
                refreshTokenExpire: new Date(Date.now() + 86400000),
            });

            expect(requester.isAuthenticated()).toBe(false);
        });

        it('should return false when refreshTokenExpire is not set', () => {
            const requester = new OAuth2Requester({
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token',
                accessTokenExpire: new Date(Date.now() + 3600000),
            });

            expect(requester.isAuthenticated()).toBe(false);
        });
    });

    describe('tokenUri initialization', () => {
        it('should initialize tokenUri from params', () => {
            const requester = new OAuth2Requester({
                tokenUri: 'https://example.com/oauth/token',
            });

            expect(requester.tokenUri).toBe('https://example.com/oauth/token');
        });

        it('should default tokenUri to null', () => {
            const requester = new OAuth2Requester({});

            expect(requester.tokenUri).toBeNull();
        });
    });

    describe('401 retry flow integration', () => {
        it('should retry with NEW token after successful refresh (not cached old token)', async () => {
            const capturedHeaders = [];
            const mockFetch = jest
                .fn()
                .mockImplementationOnce(async (url, options) => {
                    capturedHeaders.push({ ...options.headers });
                    return {
                        status: 401,
                        headers: { get: () => 'application/json' },
                        json: async () => ({ error: 'Unauthorized' }),
                    };
                })
                .mockImplementationOnce(async (url, options) => {
                    capturedHeaders.push({ ...options.headers });
                    return {
                        status: 200,
                        headers: { get: () => 'application/json' },
                        json: async () => ({ success: true }),
                    };
                });

            const requester = new OAuth2Requester({
                access_token: 'old-expired-token',
                refresh_token: 'valid-refresh-token',
                grant_type: 'authorization_code',
                fetch: mockFetch,
            });

            requester.refreshAccessToken = jest
                .fn()
                .mockImplementation(async () => {
                    requester.access_token = 'brand-new-token';
                    return { access_token: 'brand-new-token' };
                });

            const result = await requester._get({
                url: 'https://api.example.com/data',
            });

            expect(result).toEqual({ success: true });
            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(capturedHeaders[0].Authorization).toBe(
                'Bearer old-expired-token'
            );
            expect(capturedHeaders[1].Authorization).toBe(
                'Bearer brand-new-token'
            );
        });

        it('should NOT retry when refresh fails', async () => {
            const mockFetch = jest.fn().mockResolvedValue({
                status: 401,
                headers: { get: () => 'application/json' },
                json: async () => ({ error: 'Unauthorized' }),
            });

            const requester = new OAuth2Requester({
                access_token: 'old-expired-token',
                refresh_token: 'invalid-refresh-token',
                grant_type: 'authorization_code',
                fetch: mockFetch,
            });

            requester.refreshAccessToken = jest
                .fn()
                .mockRejectedValue(new Error('Refresh token expired'));
            requester.notify = jest.fn();

            await expect(
                requester._get({ url: 'https://api.example.com/data' })
            ).rejects.toThrow();

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(requester.notify).toHaveBeenCalledWith(
                requester.DLGT_INVALID_AUTH
            );
        });

        it('should not retry when refresh throws and access_token becomes undefined', async () => {
            const capturedHeaders = [];
            const mockFetch = jest
                .fn()
                .mockImplementation(async (url, options) => {
                    capturedHeaders.push({ ...options.headers });
                    return {
                        status: 401,
                        headers: { get: () => 'application/json' },
                        json: async () => ({ error: 'Unauthorized' }),
                    };
                });

            const requester = new OAuth2Requester({
                access_token: 'old-expired-token',
                refresh_token: 'invalid-refresh-token',
                grant_type: 'authorization_code',
                fetch: mockFetch,
            });

            requester.refreshAccessToken = jest
                .fn()
                .mockImplementation(async () => {
                    requester.access_token = undefined;
                    throw new Error('Refresh failed');
                });
            requester.notify = jest.fn();

            await expect(
                requester._get({ url: 'https://api.example.com/data' })
            ).rejects.toThrow();

            expect(capturedHeaders[0].Authorization).toBe(
                'Bearer old-expired-token'
            );
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('should not include Authorization header when access_token is undefined', async () => {
            const mockFetch = jest.fn().mockResolvedValue({
                status: 200,
                headers: { get: () => 'application/json' },
                json: async () => ({ success: true }),
            });

            const requester = new OAuth2Requester({
                access_token: undefined,
                fetch: mockFetch,
            });

            await requester._get({ url: 'https://api.example.com/data' });

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(
                mockFetch.mock.calls[0][1].headers.Authorization
            ).toBeUndefined();
        });

        it('retries consecutive 401s up to 3 times, then notifies INVALID_AUTH once the budget is exhausted', async () => {
            const mockFetch = jest.fn().mockResolvedValue({
                status: 401,
                headers: new Map([['Content-Type', 'application/json']]),
                json: async () => ({ error: 'Unauthorized' }),
                text: async () => JSON.stringify({ error: 'Unauthorized' }),
            });

            const requester = new OAuth2Requester({
                access_token: 'token',
                refresh_token: 'refresh',
                grant_type: 'authorization_code',
                fetch: mockFetch,
            });

            requester.refreshAccessToken = jest
                .fn()
                .mockImplementation(async () => {
                    requester.access_token = 'new-but-still-invalid-token';
                    return { access_token: 'new-but-still-invalid-token' };
                });
            requester.notify = jest.fn();

            await expect(
                requester._get({ url: 'https://api.example.com/data' })
            ).rejects.toThrow();

            expect(mockFetch).toHaveBeenCalledTimes(4);
            expect(requester.notify).toHaveBeenCalledWith(
                requester.DLGT_INVALID_AUTH,
                expect.objectContaining({ statusCode: 401 })
            );
        });

        it('should use getTokenFromClientCredentials for client_credentials grant type on 401', async () => {
            const capturedHeaders = [];
            const mockFetch = jest
                .fn()
                .mockImplementationOnce(async (url, options) => {
                    capturedHeaders.push({ ...options.headers });
                    return {
                        status: 401,
                        headers: { get: () => 'application/json' },
                        json: async () => ({ error: 'Unauthorized' }),
                    };
                })
                .mockImplementationOnce(async (url, options) => {
                    capturedHeaders.push({ ...options.headers });
                    return {
                        status: 200,
                        headers: { get: () => 'application/json' },
                        json: async () => ({ data: 'success' }),
                    };
                });

            const requester = new OAuth2Requester({
                access_token: 'old-cc-token',
                grant_type: 'client_credentials',
                fetch: mockFetch,
            });

            requester.getTokenFromClientCredentials = jest
                .fn()
                .mockImplementation(async () => {
                    requester.access_token = 'new-cc-token';
                    return { access_token: 'new-cc-token' };
                });
            requester.refreshAccessToken = jest.fn();

            const result = await requester._get({
                url: 'https://api.example.com/data',
            });

            expect(result).toEqual({ data: 'success' });
            expect(requester.getTokenFromClientCredentials).toHaveBeenCalled();
            expect(requester.refreshAccessToken).not.toHaveBeenCalled();
            expect(capturedHeaders[0].Authorization).toBe(
                'Bearer old-cc-token'
            );
            expect(capturedHeaders[1].Authorization).toBe(
                'Bearer new-cc-token'
            );
        });
    });
});
