const { OAuth2Requester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.baseUrl = 'https://api.dropboxapi.com/2';
        this.URLs = {
            me: '/openid/userinfo',
            listFolders: '/files/list_folder',
        };
        this.authorizationUri = encodeURI(
            `https://www.dropbox.com/oauth2/authorize?response_type=code` +
            `&token_access_type=offline` +
            `&prompt=consent` +
            `&scope=${this.scope}` +
            `&client_id=${this.client_id}` +
            `&redirect_uri=${this.redirect_uri}`
        );
        this.tokenUri = 'https://api.dropboxapi.com/oauth2/token';
    }



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

    async refreshAccessToken(refreshTokenObject) {
        this.access_token = undefined;
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('client_id', this.client_id);
        params.append('client_secret', this.client_secret);
        params.append('refresh_token', refreshTokenObject.refresh_token);

        const options = {
            body: params,
            url: this.tokenUri,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        };
        const response = await this._post(options, false);
        response.refresh_token = refreshTokenObject.refresh_token;
        await this.setTokens(response);
    }

    async getUserDetails() {
        const options = {
            url: this.baseUrl + this.URLs.me,
            headers: {
                'Content-Type': 'application/json'
            },
            body: {}
        };
        return this._post(options);
    }
    async getTokenIdentity() {
        const userDetails = await this.getUserDetails();
        return {identifier: userDetails.sub, name: `${userDetails.givenName} ${userDetails.familyName}`}
    }

    async listFolders() {
        const options = {
            url: this.baseUrl + this.URLs.listFolders,
            headers: {
                'Content-Type': 'application/json'
            },
            body: {
                path: '',
                "include_deleted": false,
                "include_has_explicit_shared_members": false,
                "include_media_info": false,
                "include_mounted_folders": true,
                "include_non_downloadable_files": true,
                "recursive": false
            }
        };
        return this._post(options);
    }
}

module.exports = { Api };
