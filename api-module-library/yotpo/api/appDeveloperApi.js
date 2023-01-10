const { OAuth2Requester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class appDeveloperApi extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.clientId = get(params, 'clientId', null);
        this.clientSecret = get(params, 'clientSecret', null);
        this.redirectUri = get(params, 'redirectUri', null);
        this.scope = get(params, 'scope', null);

        this.baseUrl = `https://developers.yotpo.com`;
        this.authorizationUri = encodeURI(
            `https://integrations-center.yotpo.com/app/#/install/applications/${this.client_id}?redirect_uri=${this.redirect_uri}`
        );
        this.tokenUri = `${this.baseUrl}/v2/oauth2/token`;
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
}

module.exports = { appDeveloperApi };
