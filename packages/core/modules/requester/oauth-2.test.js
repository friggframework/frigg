const { OAuth2Requester } = require('./oauth-2');

describe('OAuth2Requester', () => {
    describe('constructor', () => {
        it('should set grant_type to authorization_code by default', () => {
            const requester = new OAuth2Requester({});
            expect(requester.grant_type).toBe('authorization_code');
        });

        it('should set grant_type from params', () => {
            const requester = new OAuth2Requester({ grant_type: 'client_credentials' });
            expect(requester.grant_type).toBe('client_credentials');
        });

        it('should set isRefreshable to true', () => {
            const requester = new OAuth2Requester({});
            expect(requester.isRefreshable).toBe(true);
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

            await requester.refreshAuth();

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

            await requester.refreshAuth();

            expect(requester.refreshAccessToken).toHaveBeenCalledWith({
                refresh_token: 'test-refresh-token',
            });
        });

        it('should call getTokenFromClientCredentials for client_credentials grant type', async () => {
            const requester = new OAuth2Requester({
                grant_type: 'client_credentials',
            });
            requester.getTokenFromClientCredentials = jest.fn().mockResolvedValue({
                access_token: 'new-token',
            });
            requester.refreshAccessToken = jest.fn();

            await requester.refreshAuth();

            expect(requester.getTokenFromClientCredentials).toHaveBeenCalled();
            expect(requester.refreshAccessToken).not.toHaveBeenCalled();
        });

        it('should notify DLGT_INVALID_AUTH on error during refresh', async () => {
            const requester = new OAuth2Requester({
                grant_type: 'authorization_code',
                refresh_token: 'test-refresh-token',
            });
            requester.refreshAccessToken = jest.fn().mockRejectedValue(new Error('Token expired'));
            requester.notify = jest.fn();

            await requester.refreshAuth();

            expect(requester.notify).toHaveBeenCalledWith(requester.DLGT_INVALID_AUTH);
        });

        it('should notify DLGT_INVALID_AUTH on error during client_credentials refresh', async () => {
            const requester = new OAuth2Requester({
                grant_type: 'client_credentials',
            });
            requester.getTokenFromClientCredentials = jest.fn().mockRejectedValue(new Error('Invalid credentials'));
            requester.notify = jest.fn();

            await requester.refreshAuth();

            expect(requester.notify).toHaveBeenCalledWith(requester.DLGT_INVALID_AUTH);
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
            expect(requester.notify).toHaveBeenCalledWith(requester.DLGT_TOKEN_UPDATE);
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
});
