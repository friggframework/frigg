const { ApiKeyRequester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends ApiKeyRequester {
    constructor(params) {
        super(params);

        this.ACCOUNT_KEY = get(params, 'accountKey', null);

        // Keep as function going forward?
        this.baseUrl = () => {
            // return 'https://app.cwx-staging.com';
            return 'https://app.clubworx.com';
        };

        this.URLs = {
            // webhooks: '/api/v2/hooks',
            // webhookByID: (webhookId) => `/api/v2/hooks/${webhookId}`,
            members: '/api/v2/members',
            memberByID: (memberId) => `/api/v2/members/${memberId}`,
            prospects: '/api/v2/prospects',
            prospectByID: (prospectId) => `/api/v2/prospects/${prospectId}`,
            nonAttendingContacts: '/api/v2/non_attending_contacts',
            nonAttendingContactByID: (nonAttendingContactId) =>
                `/api/v2/non_attending_contacts/${nonAttendingContactId}`,
        };
    }

    // Don't need this
    async addAuthHeaders(headers) {
        if (this.ACCOUNT_KEY) {
            headers.Authorization = `Bearer ${this.ACCOUNT_KEY}`;
        }
        return headers;
    }

    // async createWebhook(event, targetURL) {
    //     const options = {
    //         url: this.baseUrl() + this.URLs.webhooks,
    //         headers: {
    //             'content-type': 'application/json',
    //         },
    //         query: {
    //             account_key: this.ACCOUNT_KEY,
    //         },
    //         body: {
    //             event,
    //             targetURL,
    //         },
    //     };
    //     const response = await this._post(options);
    //     return response;
    // }

    // async deleteWebhook(webhookId) {
    //     const options = {
    //         url: this.baseUrl() + this.URLs.webhookByID(webhookId),
    //         headers: {
    //             'content-type': 'application/json',
    //         },
    //         query: {
    //             account_key: this.ACCOUNT_KEY,
    //         },
    //     };
    //     const response = await this._delete(options);
    //     return response;
    // }

    async listAllMembers(query) {
        const options = {
            url: this.baseUrl() + this.URLs.members,
            query: {
                account_key: this.ACCOUNT_KEY,
            },
        };
        // for pagination
        if (query) {
            for (const [key, value] of Object.entries(query)) {
                options.query[key] = value;
            }
        }

        const response = await this._get(options);
        return response;
    }

    async retrieveMember(contactKey) {
        const options = {
            url: this.baseUrl() + this.URLs.memberByID(contactKey),
            query: {
                account_key: this.ACCOUNT_KEY,
            },
        };

        const response = await this._get(options);
        return response;
    }

    async createMember(params) {
        const options = {
            url: this.baseUrl() + this.URLs.members,
            query: params,
        };

        options.query.account_key = this.ACCOUNT_KEY;

        const response = await this._post(options);
        return response;
    }

    async updateMember(contactKey, params) {
        const options = {
            url: this.baseUrl() + this.URLs.memberByID(contactKey),
            query: params,
        };

        options.query.account_key = this.ACCOUNT_KEY;

        const response = await this._put(options);
        return response;
    }

    async listAllProspects(query) {
        const options = {
            url: this.baseUrl() + this.URLs.prospects,
            query: {
                account_key: this.ACCOUNT_KEY,
            },
        };
        // for pagination
        if (query) {
            for (const [key, value] of Object.entries(query)) {
                options.query[key] = value;
            }
        }

        const response = await this._get(options);
        return response;
    }

    async retrieveProspect(contactKey) {
        const options = {
            url: this.baseUrl() + this.URLs.prospectByID(contactKey),
            query: {
                account_key: this.ACCOUNT_KEY,
            },
        };

        const response = await this._get(options);
        return response;
    }

    async createProspect(params) {
        const options = {
            url: this.baseUrl() + this.URLs.prospects,
            query: params,
        };
        options.query.account_key = this.ACCOUNT_KEY;

        const response = await this._post(options);
        return response;
    }

    async updateProspect(contactKey, params) {
        const options = {
            url: this.baseUrl() + this.URLs.prospectByID(contactKey),
            query: params,
        };
        options.query.account_key = this.ACCOUNT_KEY;

        const response = await this._put(options);
        return response;
    }

    async listAllNonAttendingContacts(query) {
        const options = {
            url: this.baseUrl() + this.URLs.nonAttendingContacts,
            query: {
                account_key: this.ACCOUNT_KEY,
            },
        };
        // for pagination
        if (query) {
            for (const [key, value] of Object.entries(query)) {
                options.query[key] = value;
            }
        }

        const response = await this._get(options);
        return response;
    }

    async retrieveNonAttendingContact(contactKey) {
        const options = {
            url: this.baseUrl() + this.URLs.nonAttendingContactByID(contactKey),
            query: {
                account_key: this.ACCOUNT_KEY,
            },
        };

        const response = await this._get(options);
        return response;
    }

    async createNonAttendingContact(params) {
        const options = {
            url: this.baseUrl() + this.URLs.nonAttendingContacts,
            query: params,
        };
        options.query.account_key = this.ACCOUNT_KEY;

        const response = await this._post(options);
        return response;
    }

    async updateNonAttendingContact(contactKey, params) {
        const options = {
            url: this.baseUrl() + this.URLs.nonAttendingContactByID(contactKey),
            query: params,
        };
        options.query.account_key = this.ACCOUNT_KEY;

        const response = await this._put(options);
        return response;
    }
}

module.exports = { Api };
