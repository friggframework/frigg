const { get } = require('@friggframework/assertions');
const { OAuth2Requester } = require('@friggframework/module-plugin');
class botFrameworkApi extends OAuth2Requester {
    constructor(params) {
        super(params);

        this.tenant_id = get(params, 'tenant_id', null);
        // will have localization issues with this
        this.baseUrl = 'https://smba.trafficmanager.net/amer/v3'
        this.serviceUrl = 'https://smba.trafficmanager.net/amer/'
        this.scope = 'https://api.botframework.com/.default'

        // Assuming team id as a param for now
        this.team_id = get(params, 'team_id', null);

        this.URLs = {
            teamMembers: (teamChannelId) => `/conversations/${encodeURIComponent(teamChannelId)}/pagedmembers`
        };

        this.tokenUri = 'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token';
    }

    async getTokenFromClientCredentials() {
        try {
            const url = this.tokenUri;

            let body = new URLSearchParams();
            body.append('scope', this.scope);
            body.append('client_id', this.client_id);
            body.append('client_secret', this.client_secret);
            body.append('grant_type', 'client_credentials');

            const tokenRes = await this._post({
                url,
                body,
            }, false);

            await this.setTokens(tokenRes);
            return tokenRes;
        } catch {
            await this.notify(this.DLGT_INVALID_AUTH);
        }
    }

    async getTeamMembers(teamChannelId){
        const options = {
            url: `${this.baseUrl}${this.URLs.teamMembers(teamChannelId)}`
        };
        const response = await this._get(options);
        return response;
    }
}

module.exports = {botFrameworkApi};
