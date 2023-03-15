const jsforce = require('jsforce');
const { OAuth2Requester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');
const { flushDebugLog } = require('@friggframework/logs');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.jsforce = jsforce;
        this.key = get(params, 'key');
        this.secret = get(params, 'secret');
        this.instanceUrl = get(params, 'instanceUrl', null);
        this.isSandbox = get(params, 'isSandbox', false);
        if (this.isSandbox) {
            this.loginUrl = 'https://test.salesforce.com';
        } else {
            this.loginUrl = 'https://login.salesforce.com';
        }
        this.oauth2 = new jsforce.OAuth2({
            clientId: this.key,
            clientSecret: this.secret,
            redirectUri: this.redirect_uri,
            loginUrl: this.loginUrl,
        });
        this.conn = new jsforce.Connection({
            oauth2: this.oauth2,
            accessToken: this.access_token,
            refreshToken: this.refresh_token,
            instanceUrl: this.instanceUrl,
        });
        this.conn.on('refresh', (accessToken, res) => {
            console.log(accessToken);
            this.refreshAccessToken(res).then(() => {
                console.log('Refreshed');
            });
        });
        this.conn.on('error', (error) => {
            console.log(error);
        });
    }

    async getAuthorizationUri() {
        try {
            return this.oauth2.getAuthorizationUrl({});
        } catch (error) {
            return error;
        }
    }

    resetToSandbox() {
        this.oauth2 = new jsforce.OAuth2({
            clientId: this.key,
            clientSecret: this.secret,
            redirectUri: this.redirectUri,
            loginUrl: 'https://test.salesforce.com',
        });

        this.conn = new jsforce.Connection({
            oauth2: this.oauth2,
            accessToken: this.access_token,
            refreshToken: this.refresh_token,
            instanceUrl: this.instanceUrl,
        });
    }

    async getAccessToken(code) {
        try {
            await this.conn.authorize(code);
        } catch (e) {
            console.log('Error authing with the code. Trying to auth sandbox.');
            throw new Error(
                `Error Authing with Code, try Sandbox. ${JSON.stringify(e)}`
            );
        }
        const OAuthDetails = {
            access_token: this.conn.accessToken,
            refresh_token: this.conn.refreshToken,
            expiration: this.conn.expiration,
            instanceUrl: this.conn.instanceUrl,
        };
        // Set the instance URL because I'm not sure this gets set... Access and Refresh get set by setTokens,
        //   which then invokes `notify` to do the token update in the DB. The idea, though, is that auth and refresh
        //   automatically re-set the access token for future requests of the instance of the class and tells the
        //   delegate to update the DB for future requests.
        this.instanceUrl = this.conn.instanceUrl;
        await this.setTokens(OAuthDetails);
        return this.conn.accessToken;
    }

    async create(object, data) {
        const response = await this.conn.sobject(object).create(data);
        return response;
    }

    async update(object, data) {
        const response = await this.conn.sobject(object).update(data);
        return response;
    }

    async upsert(object, data) {
        const response = await this.conn.sobject(object).upsert(data);
        return response;
    }

    async list(object, ids = {}) {
        const response = await this.conn.sobject(object).retrieve(ids);
        return response;
    }

    async find(
        object,
        findFilter = {},
        returnFields = { '*': 1 },
        options = {}
    ) {
        const response = await this.conn
            .sobject(object)
            .find(findFilter, returnFields, options);
        return response;
    }

    async getGlobalMetadata() {
        const response = await this.conn.describeGlobal();
        return response;
    }

    async get(object, id) {
        const response = await this.conn.sobject(object).retrieve(id);
        return response;
    }

    async delete(object, data) {
        const response = await this.conn.sobject(object).del(data);
        return response;
    }

    async refreshAccessToken(res) {
        const OAuthDetails = {
            access_token: res.access_token,
            refresh_token: this.conn.refreshToken,
            instanceUrl: this.conn.instanceUrl,
        };
        // Set the instance URL because I'm not sure this gets set... Access and Refresh get set by setTokens,
        //   which then invokes `notify` to do the token update in the DB. The idea, though, is that auth and refresh
        //   automatically re-set the access token for future requests of the instance of the class and tells the
        //   delegate to update the DB for future requests.
        await this.setTokens(OAuthDetails);
    }
}

module.exports = { Api };
