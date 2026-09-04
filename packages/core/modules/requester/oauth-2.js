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
        /**
         * @type {string} Delegate type that asks the Module for the stored
         * credential. The requester can then adopt a concurrent invocation's
         * refresh and does not race it. See _adoptNewerCredential.
         */
        this.DLGT_CREDENTIAL_RELOAD = 'CREDENTIAL_RELOAD';

        this.delegateTypes.push(this.DLGT_TOKEN_UPDATE);
        this.delegateTypes.push(this.DLGT_TOKEN_DEAUTHORIZED);
        this.delegateTypes.push(this.DLGT_CREDENTIAL_RELOAD);

        /**
         * Re-read delays after an invalid_grant, in ms. The winner's write
         * can arrive after the loser's rejection (716 ms measured in
         * production). Wait between re-reads before you decide that the
         * credential is dead. Tests can inject other values.
         */
        this.credentialReloadBackoffMs = params?.credentialReloadBackoffMs ?? [
            500, 1000, 1500,
        ];

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
        const newRefreshToken = get(params, 'refresh_token', null);
        if (newRefreshToken !== null) {
            this.refresh_token = newRefreshToken;
        } else {
            if (this.refresh_token) {
                console.log(
                    '[Frigg] No refresh_token in response, preserving existing'
                );
            } else {
                console.log(
                    '[Frigg] Current refresh_token is null and no new refresh_token in response'
                );
            }
        }
        const accessExpiresIn = get(params, 'expires_in', null);
        const refreshExpiresIn = get(
            params,
            'x_refresh_token_expires_in',
            null
        );

        this.accessTokenExpire = new Date(Date.now() + accessExpiresIn * 1000);
        if (refreshExpiresIn !== null) {
            this.refreshTokenExpire = new Date(
                Date.now() + refreshExpiresIn * 1000
            );
        }

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
        console.log('[Frigg] Refreshing access token with options');
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
        if (await this._adoptNewerCredential()) return true;

        try {
            console.log('[Frigg] Starting token refresh', {
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
                // getTokenFromClientCredentials() reports a failed token
                // request itself and resolves to undefined. Without this
                // check, the refresh counts as a success with no new token.
                const tokenRes = await this.getTokenFromClientCredentials();
                if (!tokenRes) return false;
            }
            console.log('[Frigg] Token refresh succeeded');
            return true;
        } catch (error) {
            const moduleName = this.delegate?.name ?? 'unknown module';
            console.error(`[Frigg] Token refresh failed for ${moduleName}`, {
                error_message: error?.message,
                error_name: error?.name,
                response_status: error?.response?.status,
                response_data: error?.response?.data,
            });

            if (!this._isDefinitiveAuthRejection(error)) {
                throw this._transportFailureError(error, moduleName);
            }

            if (await this._adoptNewerCredentialWithBackoff()) return true;

            // The provider rejected the grant, and the store has nothing
            // newer. The credential is dead.
            this.telemetry?.count?.('frigg.auth.refresh_race_lost', 1, {
                module: this._telemetryModuleLabel(),
            });
            // Send the status only. The refresh body contains the
            // client_secret, and FetchError puts the body in its message
            // outside prod.
            await this.notify(this.DLGT_INVALID_AUTH, {
                statusCode: error?.statusCode,
            });
            return false;
        }
    }

    /**
     * A timeout, a 429, or a 5xx from the token endpoint says nothing about
     * the credential. The error must stay retryable: the caller fails loudly
     * (worker throw → SQS retry → DLQ) and does not flag a healthy
     * credential. This is a fresh Error on purpose. Outside prod, the
     * original message can contain the request body, and the body carries
     * the client_secret.
     */
    _transportFailureError(error, moduleName) {
        const status =
            error?.statusCode ?? error?.status ?? error?.response?.status;
        const transportError = new Error(
            `[Frigg] Token refresh transport failure for ${moduleName}` +
                (status != null ? ` (status ${status})` : '')
        );
        transportError.statusCode = status;
        transportError.isTokenRefreshTransportFailure = true;
        return transportError;
    }

    /**
     * A definitive rejection can mean that another invocation consumed this
     * refresh token first. That invocation's write can be unreadable for a
     * short time. Re-read with a bounded backoff before you decide that the
     * credential is dead.
     */
    async _adoptNewerCredentialWithBackoff() {
        for (const delayMs of this.credentialReloadBackoffMs) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            if (await this._adoptNewerCredential()) {
                console.log(
                    '[Frigg] Adopted a newer credential after a refresh rejection',
                    { module: this._telemetryModuleLabel() }
                );
                this.telemetry?.count?.('frigg.auth.refresh_race_recovered', 1, {
                    module: this._telemetryModuleLabel(),
                });
                return true;
            }
        }
        return false;
    }

    /**
     * True when the token endpoint refused the grant. RFC 6749 §5.2 sets
     * the status: 400, or 401 for invalid_client. A 429 or a 5xx is never a
     * verdict on the credential. Body markers are only a fallback for SDK
     * errors that have no status code. Production FetchErrors have a
     * sanitized body, so a marker cannot be the primary signal.
     */
    _isDefinitiveAuthRejection(error) {
        const status =
            error?.statusCode ?? error?.status ?? error?.response?.status;
        if (status !== undefined && status !== null) {
            return status === 400 || status === 401;
        }
        const haystack = [
            error?.message,
            error?.body,
            typeof error?.error === 'string' ? error.error : null,
            error?.response?.data && JSON.stringify(error.response.data),
        ]
            .filter(Boolean)
            .join(' ');
        return /\b(invalid_grant|invalid_client)\b/i.test(haystack);
    }

    /**
     * Adopts the credential stored in the database if it is newer than the
     * credential from the instance. The refresh token decides "newer": a
     * provider can rotate it and return an identical access-token string.
     * The reload only reads. A reload failure is not fatal: a database blip
     * must not change the auth behavior.
     *
     * @returns {Promise<boolean>} True if the module adopted a newer
     *   credential.
     */
    async _adoptNewerCredential() {
        let stored = null;
        try {
            stored = await this.notify(this.DLGT_CREDENTIAL_RELOAD);
        } catch (_) {
            return false;
        }
        if (!stored?.refresh_token) return false;
        if (stored.refresh_token === this.refresh_token) return false;

        if (stored.access_token) {
            this.access_token = stored.access_token;
        }
        this.refresh_token = stored.refresh_token;
        if (stored.accessTokenExpire !== undefined) {
            this.accessTokenExpire = stored.accessTokenExpire;
        }
        if (stored.refreshTokenExpire !== undefined) {
            this.refreshTokenExpire = stored.refreshTokenExpire;
        }
        return true;
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
        } catch (error) {
            // Status only. This request's body holds the password or client
            // secret, and FetchError embeds the body in its message outside
            // prod, so forwarding the error itself would log the credential.
            await this.notify(this.DLGT_INVALID_AUTH, {
                statusCode: error?.statusCode,
            });
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
        } catch (error) {
            // Status only. This request's body holds the password or client
            // secret, and FetchError embeds the body in its message outside
            // prod, so forwarding the error itself would log the credential.
            await this.notify(this.DLGT_INVALID_AUTH, {
                statusCode: error?.statusCode,
            });
        }
    }
}

module.exports = { OAuth2Requester };
