const { Requester } = require('./requester');
const { get } = require('../../assertions');
const { ModuleConstants } = require('../ModuleConstants');

/**
 * OAuth 2.0 Requester - Base class for API modules using OAuth 2.0 authentication.
 *
 * Supports multiple OAuth 2.0 grant types:
 * - `authorization_code` (default): Standard OAuth flow with user consent
 * - `client_credentials`: Server-to-server authentication without user
 * - `password`: Resource Owner Password Credentials grant
 *
 * @extends Requester
 *
 * @example
 * // Authorization Code flow (default)
 * const api = new MyApi({ grant_type: 'authorization_code' });
 * const authUrl = api.getAuthorizationUri();
 * // After user authorizes...
 * await api.getTokenFromCode(code);
 *
 * @example
 * // Client Credentials flow
 * const api = new MyApi({
 *     grant_type: 'client_credentials',
 *     client_id: process.env.CLIENT_ID,
 *     client_secret: process.env.CLIENT_SECRET,
 *     audience: 'https://api.example.com',
 * });
 * await api.getTokenFromClientCredentials();
 */
class OAuth2Requester extends Requester {

    static requesterType = ModuleConstants.authType.oauth2;

    /**
     * Creates an OAuth2Requester instance.
     *
     * @param {Object} params - Configuration parameters
     * @param {string} [params.grant_type='authorization_code'] - OAuth grant type:
     *   'authorization_code', 'client_credentials', or 'password'
     * @param {string} [params.client_id] - OAuth client ID
     * @param {string} [params.client_secret] - OAuth client secret
     * @param {string} [params.redirect_uri] - OAuth redirect URI for authorization code flow
     * @param {string} [params.scope] - OAuth scopes (space-separated)
     * @param {string} [params.authorizationUri] - Authorization endpoint URL
     * @param {string} [params.tokenUri] - Token endpoint URL for exchanging codes/credentials
     * @param {string} [params.baseURL] - Base URL for API requests
     * @param {string} [params.access_token] - Existing access token
     * @param {string} [params.refresh_token] - Existing refresh token
     * @param {Date} [params.accessTokenExpire] - Access token expiration date
     * @param {Date} [params.refreshTokenExpire] - Refresh token expiration date
     * @param {string} [params.audience] - Token audience (for client_credentials)
     * @param {string} [params.username] - Username (for password grant)
     * @param {string} [params.password] - Password (for password grant)
     * @param {string} [params.state] - OAuth state parameter for CSRF protection
     */
    constructor(params) {
        super(params);
        /** @type {string} Delegate type for token update notifications */
        this.DLGT_TOKEN_UPDATE = 'TOKEN_UPDATE';
        /** @type {string} Delegate type for token deauthorization notifications */
        this.DLGT_TOKEN_DEAUTHORIZED = 'TOKEN_DEAUTHORIZED';

        this.delegateTypes.push(this.DLGT_TOKEN_UPDATE);
        this.delegateTypes.push(this.DLGT_TOKEN_DEAUTHORIZED);

        /** @type {string} OAuth grant type */
        this.grant_type = get(params, 'grant_type', 'authorization_code');
        /** @type {string|null} OAuth client ID */
        this.client_id = get(params, 'client_id', null);
        /** @type {string|null} OAuth client secret */
        this.client_secret = get(params, 'client_secret', null);
        /** @type {string|null} OAuth redirect URI */
        this.redirect_uri = get(params, 'redirect_uri', null);
        /** @type {string|null} OAuth scopes */
        this.scope = get(params, 'scope', null);
        /** @type {string|null} Authorization endpoint URL */
        this.authorizationUri = get(params, 'authorizationUri', null);
        /** @type {string|null} Token endpoint URL */
        this.tokenUri = get(params, 'tokenUri', null);
        /** @type {string|null} Base URL for API requests */
        this.baseURL = get(params, 'baseURL', null);
        /** @type {string|null} Current access token */
        this.access_token = get(params, 'access_token', null);
        /** @type {string|null} Current refresh token */
        this.refresh_token = get(params, 'refresh_token', null);
        /** @type {Date|null} Access token expiration */
        this.accessTokenExpire = get(params, 'accessTokenExpire', null);
        /** @type {Date|null} Refresh token expiration */
        this.refreshTokenExpire = get(params, 'refreshTokenExpire', null);
        /** @type {string|null} Token audience */
        this.audience = get(params, 'audience', null);
        /** @type {string|null} Username for password grant */
        this.username = get(params, 'username', null);
        /** @type {string|null} Password for password grant */
        this.password = get(params, 'password', null);
        /** @type {string|null} OAuth state for CSRF protection */
        this.state = get(params, 'state', null);

        /** @type {boolean} Whether this requester supports token refresh */
        this.isRefreshable = true;
    }

    /**
     * Sets OAuth tokens and calculates expiration times.
     * Notifies delegates of token update via DLGT_TOKEN_UPDATE.
     *
     * @param {Object} params - Token response from OAuth server
     * @param {string} params.access_token - The access token
     * @param {string} [params.refresh_token] - The refresh token (if provided)
     * @param {number} [params.expires_in] - Access token lifetime in seconds
     * @param {number} [params.x_refresh_token_expires_in] - Refresh token lifetime in seconds
     * @returns {Promise<void>}
     */
    async setTokens(params) {
        this.access_token = get(params, 'access_token');
        this.refresh_token = get(params, 'refresh_token', null);
        const accessExpiresIn = get(params, 'expires_in', null);
        const refreshExpiresIn = get(
            params,
            'x_refresh_token_expires_in',
            null
        );

        this.accessTokenExpire = new Date(Date.now() + accessExpiresIn * 1000);
        this.refreshTokenExpire = new Date(Date.now() + refreshExpiresIn * 1000);

        await this.notify(this.DLGT_TOKEN_UPDATE);
    }

    /**
     * Gets the OAuth authorization URL for initiating the authorization code flow.
     *
     * @returns {string|null} The authorization URL
     */
    getAuthorizationUri() {
        return this.authorizationUri;
    }

    /**
     * Returns authorization requirements for this OAuth flow.
     *
     * @returns {{url: string|null, type: string}} Authorization requirements
     */
    getAuthorizationRequirements() {
        return {
            url: this.getAuthorizationUri(),
            type: 'oauth2',
        };
    }

    /**
     * Exchanges an authorization code for access and refresh tokens.
     * Requires client_id, client_secret, redirect_uri, and tokenUri to be set.
     *
     * @param {string} code - The authorization code from the OAuth callback
     * @returns {Promise<Object>} Token response containing access_token, refresh_token, etc.
     */
    async getTokenFromCode(code) {
        console.log('[OAuth2Requester.getTokenFromCode] Exchanging code for token', {
            tokenUri: this.tokenUri,
            has_client_id: !!this.client_id,
            has_client_secret: !!this.client_secret,
            has_redirect_uri: !!this.redirect_uri,
            has_scope: !!this.scope,
            code_length: code ? String(code).length : 0,
        });
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('client_id', this.client_id);
        params.append('client_secret', this.client_secret);
        params.append('redirect_uri', this.redirect_uri);
        params.append('scope', this.scope);
        params.append('code', code);
        const options = {
            body: params,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            url: this.tokenUri,
        };
        const response = await this._post(options, false);
        if (!response?.access_token) {
            console.error('[OAuth2Requester.getTokenFromCode] Missing access_token in response', {
                tokenUri: this.tokenUri,
                response_keys:
                    response && typeof response === 'object'
                        ? Object.keys(response)
                        : typeof response,
                error: response?.error,
                error_description: response?.error_description,
            });
        }
        await this.setTokens(response);
        return response;
    }

    /**
     * Exchanges an authorization code for tokens using Basic Auth header.
     * Alternative to getTokenFromCode() for OAuth servers requiring Basic Auth.
     * Override getTokenFromCode() in child class to use this instead.
     *
     * @param {string} code - The authorization code from the OAuth callback
     * @returns {Promise<Object>} Token response containing access_token, refresh_token, etc.
     */
    async getTokenFromCodeBasicAuthHeader(code) {
        console.log('[OAuth2Requester.getTokenFromCodeBasicAuthHeader] Exchanging code for token', {
            tokenUri: this.tokenUri,
            has_client_id: !!this.client_id,
            has_client_secret: !!this.client_secret,
            has_redirect_uri: !!this.redirect_uri,
            code_length: code ? String(code).length : 0,
        });
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('client_id', this.client_id);
        params.append('redirect_uri', this.redirect_uri);
        params.append('code', code);

        const options = {
            body: params,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${Buffer.from(
                    `${this.client_id}:${this.client_secret}`
                ).toString('base64')}`,
            },
            url: this.tokenUri,
        };

        const response = await this._post(options, false);
        if (!response?.access_token) {
            console.error('[OAuth2Requester.getTokenFromCodeBasicAuthHeader] Missing access_token in response', {
                tokenUri: this.tokenUri,
                response_keys:
                    response && typeof response === 'object'
                        ? Object.keys(response)
                        : typeof response,
                error: response?.error,
                error_description: response?.error_description,
            });
        }
        await this.setTokens(response);
        return response;
    }

    /**
     * Refreshes the access token using the refresh token.
     * Used for authorization_code and password grant types.
     *
     * @param {Object} refreshTokenObject - Object containing refresh_token
     * @param {string} refreshTokenObject.refresh_token - The refresh token
     * @returns {Promise<Object>} New token response
     */
    async refreshAccessToken(refreshTokenObject) {
        this.access_token = undefined;
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('client_id', this.client_id);
        params.append('client_secret', this.client_secret);
        params.append('refresh_token', refreshTokenObject.refresh_token);
        params.append('redirect_uri', this.redirect_uri);

        const options = {
            body: params,
            url: this.tokenUri,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        };
        const response = await this._post(options, false);
        await this.setTokens(response);
        return response;
    }

    /**
     * Adds OAuth Bearer token to request headers.
     * Clears any existing Authorization header first to prevent stale tokens
     * from being reused after failed refresh attempts.
     *
     * @param {Object} headers - Headers object to modify
     * @returns {Promise<Object>} Headers with Authorization added
     */
    async addAuthHeaders(headers) {
        delete headers.Authorization;
        if (this.access_token) {
            headers.Authorization = `Bearer ${this.access_token}`;
        }

        return headers;
    }

    /**
     * Checks if the requester has valid authentication.
     *
     * @returns {boolean} True if authenticated with valid tokens
     */
    isAuthenticated() {
        return !!(
            this.access_token !== null &&
            this.refresh_token !== null &&
            this.accessTokenExpire &&
            this.refreshTokenExpire
        );
    }

    /**
     * Refreshes authentication based on the configured grant type.
     * - For authorization_code/password: Uses refreshAccessToken() with refresh_token
     * - For client_credentials: Uses getTokenFromClientCredentials() to get new token
     *
     * On failure, notifies delegates via DLGT_INVALID_AUTH.
     *
     * @returns {Promise<boolean>} True if refresh succeeded, false if failed
     */
    async refreshAuth() {
        try {
            console.log('[OAuth2Requester.refreshAuth] Starting token refresh', {
                grant_type: this.grant_type,
                has_refresh_token: !!this.refresh_token,
                has_client_id: !!this.client_id,
                has_client_secret: !!this.client_secret,
                has_token_uri: !!this.tokenUri,
                tokenUri: this.tokenUri,
            });

            if (this.grant_type !== 'client_credentials') {
                await this.refreshAccessToken({
                    refresh_token: this.refresh_token,
                });
            } else {
                await this.getTokenFromClientCredentials();
            }
            console.log('[OAuth2Requester.refreshAuth] Token refresh succeeded');
            return true;
        } catch (error) {
            console.error('[OAuth2Requester.refreshAuth] Token refresh failed', {
                error_message: error?.message,
                error_name: error?.name,
                response_status: error?.response?.status,
                response_data: error?.response?.data,
            });
            await this.notify(this.DLGT_INVALID_AUTH);
            return false;
        }
    }

    /**
     * Obtains tokens using the Resource Owner Password Credentials grant.
     * Requires username and password to be set.
     *
     * @returns {Promise<Object|undefined>} Token response or undefined on error
     */
    async getTokenFromUsernamePassword() {
        try {
            const url = this.tokenUri;

            const body = {
                username: this.username,
                password: this.password,
                grant_type: 'password',
            };
            const headers = {
                'Content-Type': 'application/json',
            };

            const tokenRes = await this._post({
                url,
                body,
                headers,
            });

            await this.setTokens(tokenRes);
            return tokenRes;
        } catch {
            await this.notify(this.DLGT_INVALID_AUTH);
        }
    }

    /**
     * Obtains tokens using the Client Credentials grant.
     * Used for server-to-server authentication without a user context.
     * Requires client_id, client_secret, and optionally audience to be set.
     *
     * @returns {Promise<Object|undefined>} Token response or undefined on error
     */
    async getTokenFromClientCredentials() {
        try {
            const url = this.tokenUri;

            const body = {
                audience: this.audience,
                client_id: this.client_id,
                client_secret: this.client_secret,
                grant_type: 'client_credentials',
            };
            const headers = {
                'Content-Type': 'application/json',
            };

            const tokenRes = await this._post({
                url,
                body,
                headers,
            });

            await this.setTokens(tokenRes);
            return tokenRes;
        } catch {
            await this.notify(this.DLGT_INVALID_AUTH);
        }
    }
}

module.exports = { OAuth2Requester };
