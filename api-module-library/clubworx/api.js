const { ApiKeyRequester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends ApiKeyRequester {
    constructor(params) {
        super(params);

        this.ACCOUNT_KEY = get(params, 'accountKey', null);

        // Keep as function going forward?
        this.baseUrl = () => {
            // return 'https://app.cwx-staging.com';
            return 'https://app.clubworx.com/api/v2';
        };

        this.URLs = {
            // webhooks: '/hooks',
            // webhookByID: (webhookId) => `/hooks/${webhookId}`,
            members: '/members',
            memberByID: (memberId) => `/members/${memberId}`,
            membershipPlans: '/membership_plans',
            prospects: '/prospects',
            prospectByID: (prospectId) => `/prospects/${prospectId}`,
            prospectStatuses: '/prospect_statuses',
            nonAttendingContacts: '/non_attending_contacts',
            nonAttendingContactByID: (nonAttendingContactId) =>
                `/non_attending_contacts/${nonAttendingContactId}`,
        };
    }

    async createWebhook(event, targetURL) {
        const options = {
            url: this.baseUrl() + this.URLs.webhooks,
            headers: {
                'content-type': 'application/json',
            },
            query: {
                account_key: this.ACCOUNT_KEY,
            },
            body: {
                target_url: targetURL,
                event,
            },
        };
        const response = await this._post(options);
        return response;
    }

    async deleteWebhook(webhookId) {
        const options = {
            url:
                this.baseUrl() +
                this.URLs.webhookByID(webhookId) +
                '/unsubscribe',
            headers: {
                'content-type': 'application/json',
            },
            query: {
                account_key: this.ACCOUNT_KEY,
            },
        };
        const response = await this._delete(options);
        return response;
    }

    async listAllMembershipPlans(query) {
        const options = {
            url: this.baseUrl() + this.URLs.membershipPlans,
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

    async listAllProspectStatuses(query) {
        const options = {
            url: this.baseUrl() + this.URLs.prospectStatuses,
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
