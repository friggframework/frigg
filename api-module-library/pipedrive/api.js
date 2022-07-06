const OAuth2Base = require('../../base/auth/OAuth2Base');

class Api extends OAuth2Base {
    constructor(params) {
        super(params);

        this.access_token = this.getParam(params, 'access_token', null);
        this.refresh_token = this.getParam(params, 'refresh_token', null);
        this.companyDomain = this.getParam(params, 'companyDomain', null);
        this.baseURL = () => `${this.companyDomain}/api`;

        this.client_id = process.env.PIPEDRIVE_CLIENT_ID;
        this.client_secret = process.env.PIPEDRIVE_CLIENT_SECRET;
        this.redirect_uri = `${process.env.REDIRECT_URI}/pipedrive`;
        this.scopes = process.env.PIPEDRIVE_SCOPES;

        this.URLs = {
            activities: '/v1/activities',
            activityFields: '/v1/activityFields',
            activityById: (activityId) => `/v1/activities/${activityId}`,
            getUser: '/v1/users/me',
            users: '/v1/users',
            deals: '/v1/deals',
        };

        this.authorizationUri = encodeURI(
            `https://oauth.pipedrive.com/oauth/authorize?client_id=${this.client_id}&redirect_uri=${this.redirect_uri}&response_type=code&scope=${this.scopes}`
        );

        this.tokenUri = 'https://oauth.pipedrive.com/oauth/token';
    }

    async setTokens(params) {
        await this.setCompanyDomain(params.api_domain);
        return super.setTokens(params);
    }

    async setCompanyDomain(companyDomain) {
        this.companyDomain = companyDomain;
    }
    // **************************   Deals   **********************************
    async listDeals() {
        const options = {
            url: this.baseURL() + this.URLs.deals,
        };
        const res = await this._get(options);
        return res;
    }
    // **************************   Activities   **********************************
    async listActivityFields() {
        const options = {
            url: this.baseURL() + this.URLs.activityFields,
        };
        const res = await this._get(options);
        return res;
    }

    async listActivities(params) {
        const options = {
            url: this.baseURL() + this.URLs.activities,
        };
        if (params.query) {
            options.query = params.query;
        }
        const res = await this._get(options);
        return res;
    }

    async deleteActivity(activityId) {
        const options = {
            url: this.baseURL() + this.URLs.activityById(activityId),
        };
        const res = await this._delete(options);
        return res;
    }

    async updateActivity(activityId, task) {
        const options = {
            url: this.baseURL() + this.URLs.activityById(activityId),
            body: task,
        };
        const res = await this._patch(options);
        return res;
    }

    async createActivity(params) {
        const dealId = this.getParam(params, 'dealId', null);
        const subject = this.getParam(params, 'subject');
        const type = this.getParam(params, 'type');
        const options = {
            url: this.baseURL() + this.URLs.activities,
            body: { ...params },
            headers: {
                'Content-Type': 'application/json',
            },
        };
        const res = await this._post(options);
        return res;
    }
    // **************************   Users   **********************************
    async getUser() {
        const options = {
            url: this.baseURL() + this.URLs.getUser,
        };
        const res = await this._get(options);
        return res;
    }

    async listUsers() {
        const options = {
            url: this.baseURL() + this.URLs.users,
        };
        const res = await this._get(options);
        return res;
    }
}
module.exports = { Api };
