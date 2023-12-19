const { OAuth2Requester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.app_uid = get(params, 'app_uid', null);
        this.organization_uid = get(params, 'organization_uid', null);
        this.api_key = get(params, 'api_key', null);

        this.baseUrl = 'https://api.contentstack.io';

        this.URLs = {
            stacks: '/v3/stacks',
            contentTypes: '/v3/content_types',
            entries: (content_type_uid) =>
                `/v3/content_types/${content_type_uid}/entries`,
            entry: (content_type_uid, entry_uid) =>
                `/v3/content_types/${content_type_uid}/entries/${entry_uid}`,
            roles: '/v3/roles',
            languages: '/v3/locales',
        };

        this.authorizationUri = encodeURI(
            `https://app.contentstack.com/#!/apps/${this.app_uid}/install`
        );
        this.tokenUri = 'https://app.contentstack.com/apps-api/apps/token';

        this.access_token = get(params, 'access_token', null);
        this.refresh_token = get(params, 'refresh_token', null);
    }
    setOrganizationUid(organization_uid) {
        this.organization_uid = organization_uid;
    }
    setApiKey(api_key) {
        this.api_key = api_key;
    }
    async setTokens(params) {
        this.access_token = get(params, 'access_token');
        this.refresh_token = get(params, 'refresh_token', null);
        this.setOrganizationUid(get(params, 'organization_uid', null));
        this.setApiKey(get(params, 'stack_api_key', null));
        await this.notify(this.DLGT_TOKEN_UPDATE);
    }

    addAuthHeaders(headers) {
        const newHeaders = { ...headers };
        if (this.access_token) {
            newHeaders.Authorization = `Bearer ${this.access_token}`;
        }
        if (this.organization_uid) {
            newHeaders['organization_uid'] = this.organization_uid;
        }
        if (this.api_key) {
            newHeaders['api_key'] = this.api_key;
        }

        return newHeaders;
    }

    getAuthUri(type = 'User') {
        let url;
        if (type === 'User') return this.authorizationUri;
    }
    async getStack() {
        const options = {
            url: this.baseUrl + this.URLs.stacks,
        };

        const res = await this._get(options);
        return res;
    }

    async listContentTypes(query = {}) {
        const options = {
            url: this.baseUrl + this.URLs.contentTypes,
            query,
        };

        return this._get(options);
    }

    async listEntries(contentTypeUid,query = {}) {
        const options = {
            url: this.baseUrl + this.URLs.entries(contentTypeUid),
            query,
        };

        return this._get(options);
    }

    async getEntry(contentTypeUid, entryUid) {
        const options = {
            url: this.baseUrl + this.URLs.entry(contentTypeUid, entryUid),
        };

        return this._get(options);
    }

    async getEntryLocales(contentTypeUid, entryUid) {
        const options = {
            url: `${this.baseUrl}${this.URLs.entry(contentTypeUid, entryUid)}/locales`,
        };

        return this._get(options);
    }

    async updateEntry(contentTypeUid, entryUid, body = {}, query = {}) {
        const options = {
            url: this.baseUrl + this.URLs.entry(contentTypeUid, entryUid),
            body,
            query,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        return this._put(options);
    }

    async listLocales(query = {}) {
        const options = {
            url: this.baseUrl + this.URLs.languages,
            query,
        };

        return this._get(options);
    }

    async listRoles(query = {}) {
        const options = {
            url: this.baseUrl + this.URLs.roles,
            query,
        };

        return this._get(options);
    }
}

module.exports = { Api };
