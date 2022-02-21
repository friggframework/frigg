const moment = require('moment');
const Requester = require('../Requester.js');
const { get } = require('@friggframework/assertions');

class OAuth2Base extends Requester {
    constructor(params) {
        super(params);
        this.DLGT_TOKEN_UPDATE = 'TOKEN_UPDATE';
        this.DLGT_TOKEN_DEAUTHORIZED = 'TOKEN_DEAUTHORIZED';

        this.delegateTypes.push(this.DLGT_TOKEN_UPDATE);
        this.delegateTypes.push(this.DLGT_TOKEN_DEAUTHORIZED);

        this.grantType = get(params, 'grantType', 'authorization_code');
        this.key = get(params, 'key', null);
        this.secret = get(params, 'secret', null);
        this.redirectUri = get(params, 'redirectUri', null);
        this.authorizationUri = get(params, 'authorizationUri', null);
        this.baseURL = get(params, 'baseURL', null);
        this.access_token = get(params, 'access_token', null);
        this.refresh_token = get(params, 'refresh_token', null);
        this.accessTokenExpire = get(params, 'accessTokenExpire', null);
        this.refreshTokenExpire = get(params, 'refreshTokenExpire', null);
        this.audience = get(params, 'audience', null);
        this.username = get(params, 'username', null);
        this.password = get(params, 'password', null);

        this.isRefreshable = true;
    }

    async setTokens(params) {
        this.access_token = get(params, 'access_token');
        this.refresh_token = get(params, 'refresh_token', null);
        const accessExpiresIn = get(params, 'expires_in', null);
        const refreshExpiresIn = get(
            params,
            'x_refresh_token_expires_in',
            null
        );

        this.accessTokenExpire = moment().add(accessExpiresIn, 'seconds');
        this.refreshTokenExpire = moment().add(refreshExpiresIn, 'seconds');

        await this.notify(this.DLGT_TOKEN_UPDATE);
    }

    getAuthorizationUri() {
        return this.authorizationUri;
    }

    // this.client_id, this.client_secret, this.redirect_uri, and this.tokenUri
    // will need to be defined in the child class before super(params)
    async getTokenFromCode(code) {
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('client_id', this.client_id);
        params.append('client_secret', this.client_secret);
        params.append('redirect_uri', this.redirect_uri);
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

    // REPLACE getTokenFromCode IN THE CHILD IF NEEDED
    // this.client_id, this.client_secret, this.redirect_uri, and this.tokenUri
    // will need to be defined in the child class before super(params)
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

    // this.client_id, this.client_secret, this.redirect_uri, and this.tokenUri
    // will need to be defined in the child class before super(params)
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
        };
        const response = await this._post(options, false);
        await this.setTokens(response);
        return response;
    }

    async addAuthHeaders(headers) {
        if (this.access_token) {
            headers.Authorization = `Bearer ${this.access_token}`;
        }

        return headers;
    }

    isAuthenticated() {
        return (
            this.accessToken !== null &&
            this.refreshToken !== null &&
            this.accessTokenExpire &&
            this.refreshTokenExpire
        );
    }

    async refreshAuth() {
        try {
            if (this.grantType !== 'client_credentials') {
                await this.refreshAccessToken({
                    refresh_token: this.refresh_token,
                });
            } else {
                await this.getTokenFromClientCredentials();
            }
        } catch {
            await this.notify(this.DLGT_INVALID_AUTH);
        }
    }

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

module.exports = OAuth2Base;
