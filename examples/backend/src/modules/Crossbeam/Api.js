const moment = require('moment');
const OAuth2Base = require('../../base/auth/OAuth2Base');

class CrossbeamAPI extends OAuth2Base {
    constructor(params) {
        super(params);

        this.baseUrl = 'https://api.crossbeam.com';
        this.audience = 'https://api.getcrossbeam.com';

        this.client_id = process.env.CROSSBEAM_CLIENT_ID;
        this.client_secret = process.env.CROSSBEAM_CLIENT_SECRET;
        this.redirect_uri = `${process.env.REDIRECT_URI}/crossbeam`;
        this.scopes = process.env.CROSSBEAM_SCOPES;

        this.URLs = {
            // authorization: (audience) => `/authorize?audience=${audience}`,
            access_token: '/oauth/token',
            partner_populations: '/v0.1/partner-populations',
            partners: '/v0.1/partners',
            partner_records: '/v0.1/partner-records',
            populations: '/v0.1/populations',
            reports: '/v0.2/reports',
            reports_data: (report_id) => `/v0.1/reports/${report_id}/data`,
            search: '/v0.1/search',
            threads: '/v0.1/threads',
            thread_timeline: (thread_id) =>
                `/v0.1/threads/${thread_id}/timeline`,
            user_info: '/v0.1/users/me',
        };

        this.authorizationUri = encodeURI(
            `https://auth.crossbeam.com/authorize?state=app:CROSSBEAM&client_id=${this.client_id}&protocol=oauth2&audience=${this.audience}&response_type=code&scope=${this.scopes}&redirect_uri=${this.redirect_uri}`
        );
        // this.authorizationUri = `https://auth.crossbeam.com/login?state=app:CROSSBEAM&client=${this.client_id}&protocol=oauth2&audience=${this.audience}&response_type=code&scope=${this.scopes}&redirect_uri=${this.redirect_uri}`;
        this.tokenUri = 'https://auth.crossbeam.com/oauth/token';

        this.access_token = this.getParam(params, 'access_token', null);
        this.refresh_token = this.getParam(params, 'refresh_token', null);
        this.organization_id = this.getParam(params, 'organization_id', null);
    }

    async getTokenFromCode(code) {
        return this.getTokenFromCodeBasicAuthHeader(code);
    }

    async setOrganizationId(organization_id) {
        this.organization_id = organization_id;
    }

    async addAuthHeaders(headers) {
        // Overrides parent
        const newHeaders = headers;
        if (this.access_token) {
            newHeaders.Authorization = `Bearer ${this.access_token}`;
        }
        if (this.organization_id) {
            newHeaders['Xbeam-Organization'] = this.organization_id;
        }

        return newHeaders;
    }

    async getUserDetails() {
        const options = {
            url: this.baseUrl + this.URLs.user_info,
        };

        const res = await this._get(options);
        return res;
    }

    async getPartnerPopulations(query) {
        const options = {
            url: this.baseUrl + this.URLs.partner_populations,
            query,
        };
        const res = await this._get(options);
        return res;
    }

    async getPartners(query) {
        const options = {
            url: this.baseUrl + this.URLs.partners,
            query,
        };

        const res = await this._get(options);
        return res;
    }

    async getPartnerRecords(query) {
        const options = {
            url: this.baseUrl + this.URLs.partner_records,
            query,
        };
        const res = await this._get(options);
        return res;
    }

    async getPopulations(query) {
        const options = {
            url: this.baseUrl + this.URLs.populations,
            query,
        };
        const res = await this._get(options);
        return res;
    }

    async getReports(query) {
        const options = {
            url: this.baseUrl + this.URLs.reports,
            query,
        };

        const res = await this._get(options);
        return res;
    }

    async getReportData(report_id, query) {
        const options = {
            url: this.baseUrl + this.URLs.reports_data(report_id),
            query,
        };

        const res = await this._get(options);
        return res;
    }

    async search(search_term) {
        const options = {
            url: this.baseUrl + this.URLs.search,
            query: {
                search: search_term,
            },
        };

        const res = await this._get(options);
        return res;
    }

    async getThreads(query) {
        const options = {
            url: this.baseUrl + this.URLs.threads,
            query,
        };

        const res = await this._get(options);
        return res;
    }

    async getThreadTimelines(thread_id, query) {
        const options = {
            url: this.baseUrl + this.URLs.thread_timeline(thread_id),
            query,
        };
        const res = await this._get(options);
        return res;
    }
}

module.exports = CrossbeamAPI;
