const { get } = require('../../../assertions');
const { OAuth2Requester } = require('../..');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.baseUrl = 'https://api.anapi.com';

        this.URLs = {
            authorization: '/oauth/authorize',
            access_token: '/oauth/v1/token',
        };

        this.authorizationUri = encodeURI(
            `https://app.anapi.com/oauth/authorize?client_id=${this.client_id}&redirect_uri=${this.redirect_uri}&scope=${this.scope}&state=${this.state}`
        );
        this.tokenUri = 'https://api.anapi.com/oauth/v1/token';

        this.access_token = get(params, 'access_token', null);
        this.refresh_token = get(params, 'refresh_token', null);
    }
    getAuthUri() {
        return this.authorizationUri;
    }

    getAuthorizationRequirements() {
        return {
            url: this.getAuthUri(),
            type: 'oauth2',
        };
    }
}

module.exports = { Api };
