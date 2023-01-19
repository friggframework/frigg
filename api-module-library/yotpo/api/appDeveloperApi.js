const { OAuth2Requester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class appDeveloperApi extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.isRefreshable = false; // No refresh token
        this.redirectUri = get(params, 'redirectUri', null);
        this.scope = get(params, 'scope', null);
        this.appKey = get(params, 'appKey', null);

        this.baseUrl = `https://developers.yotpo.com`;
        this.authorizationUri = encodeURI(
            `https://integrations-center.yotpo.com/app/#/install/applications/${this.client_id}?redirect_uri=${this.redirect_uri}`
        );
        this.tokenUri = `${this.baseUrl}/v2/oauth2/token`;
        this.URLs = {
            listOrders: () => `${this.baseUrl}/v2/${this.appKey}/orders`,
        };
    }

    // Making sure we append the access_token to the query since that;s the only way it works
    async _request(url, options, i = 0) {
        if (this.access_token) options.query.access_token = this.access_token;
        return super._request(url, options, i);
    }
    async getTokenFromCode(code, app_key) {
        const options = {
            body: {
                grant_type: 'authorization_code',
                client_id: this.client_id,
                client_secret: this.client_secret,
                code,
                redirect_uri: this.redirect_uri,
                app_key,
            },
            headers: {
                'Content-Type': 'application/json',
                Accept: '*/*',
            },
            url: this.tokenUri,
        };
        const response = await this._post(options);
        await this.setTokens(response);
        return response;
    }
    async listOrders() {
        const options = {
            url: this.URLs.listOrders(),
        };

        const response = await this._get(options);
        return response;
    }
}

module.exports = { appDeveloperApi };
