const ApiKeyBase = require('@friggframework/core/auth/ApiKeyBase');

class ActiveCampaignAPI extends ApiKeyBase {
    constructor(params) {
        super(params);

        this.API_KEY_NAME = 'Api-Token';
        this.API_KEY_VALUE = get(params, 'apiKey');
        this.API_URL = get(params, 'apiUrl');
        this.baseURL = `${this.API_URL}/api/3`;

        this.URLs = {
            accounts: '/accounts',
            contacts: '/contacts',
            accountContacts: '/accountContacts',
            user_info: '/users/me',
            tasks: '/dealTasks',
            tags: '/tags',
            contactTags: '/contactTags',
            bulkImport: '/import/bulk_import',
        };
    }

    async createContact(body) {
        const options = {
            url: this.baseURL + this.URLs.contacts,
            body,
        };
        return this._post(options);
    }

    async retrieveContact(contactId) {
        const options = {
            url: `${this.baseURL}${this.URLs.contacts}/${contactId}`,
        };
        return this._get(options);
    }

    async updateContact(contactId, body) {
        const options = {
            url: `${this.baseURL}${this.URLs.contacts}/${contactId}`,
            body,
        };

        return this._put(options);
    }

    async deleteContact(contactId) {
        const options = {
            url: `${this.baseURL}${this.URLs.contacts}/${contactId}`,
        };

        return this._delete(options);
    }

    async listAccounts(params) {
        const options = {
            url: this.baseURL + this.URLs.accounts,
            query: {},
        };

        if (params) {
            for (const param in params) {
                options.query[param] = get(params, `${param}`, null);
            }
        }

        const res = await this._get(options);
        return res;
    }

    async retrieveAccount(accountId) {
        const options = {
            url: `${this.baseURL}${this.URLs.accounts}/${accountId}`,
        };
        return this._get(options);
    }

    async deleteAccount(accountId) {
        const options = {
            url: `${this.baseURL}${this.URLs.accounts}/${accountId}`,
        };

        return this._delete(options);
    }

    async createAccount(body) {
        const options = {
            url: this.baseURL + this.URLs.accounts,
            body,
        };

        return this._post(options);
    }

    async updateAccount(accountId, body) {
        const options = {
            url: `${this.baseURL}${this.URLs.accounts}/${accountId}`,
            body,
        };

        return this._put(options);
    }

    async createAccountNote(accountId, body) {
        const options = {
            url: `${this.baseURL}${this.URLs.accounts}/${accountId}/notes`,
            body,
        };

        return this._post(options);
    }

    async updateAccountNote(accountId, noteId, body) {
        const options = {
            url: `${this.baseURL}${this.URLs.accounts}/${accountId}/notes/${noteId}`,
            body,
        };

        return this._put(options);
    }

    async listContacts() {
        const options = {
            url: this.baseURL + this.URLs.contacts,
        };
        return this._get(options);
    }

    async listAccountContacts() {
        return this._get(this.URLs.accountContacts);
    }

    async retrieveAccountContact(accountId) {
        const options = {
            url: `${this.baseURL}${this.URLs.accountContacts}/${accountId}`,
        };

        return this._get(options);
    }

    async deleteAccountContact(accountId) {
        const options = {
            url: `${this.baseURL}${this.URLs.accountContacts}/${accountId}`,
        };

        return this._delete(options);
    }

    async createAccountContact(body) {
        const options = {
            url: this.URLs.accountContacts,
            body,
        };

        return this._post(options);
    }

    async updateAccountContact(accountId, body) {
        const options = {
            url: `${this.baseURL}${this.URLs.accountContacts}/${accountId}`,
            body,
        };

        return this._put(options);
    }

    async createTask() {
        const options = {
            url: this.baseURL + this.URLs.tasks,
        };

        return this._get(options);
    }

    async getUserDetails() {
        return this._get(this.URLs.user_info);
    }

    async listTags() {
        const options = {
            url: this.baseURL + this.URLs.tags,
        };

        return this._get(options);
    }

    async createTag(body) {
        const options = {
            url: this.baseURL + this.URLs.tags,
            body,
        };

        return this._post(options);
    }

    async addTagToContact(body) {
        const options = {
            url: this.baseURL + this.URLs.contactTags,
            body,
        };

        return this._post(options);
    }

    async bulkContactImport(body) {
        const options = {
            url: this.baseURL + this.URLs.bulkImport,
            body,
        };

        return this._post(options);
    }

    async deleteTag(tagId) {
        const options = {
            url: `${this.baseURL}${this.URLs.tags}/${tagId}`,
        };
        return this._delete(options);
    }

    /*async _listAll(path) {
        const options = {
            url: this.baseURL + path,
        };
        const res = await this._get(options);
        return res;
    }*/
}

module.exports = ActiveCampaignAPI;
