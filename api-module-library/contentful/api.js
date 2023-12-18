const { OAuth2Requester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.baseUrl = 'https://api.contentful.com/';
        this.envId = 'master';

        this.URLs = {
            me: this.baseUrl + 'users/me',
            spaces: this.baseUrl + 'spaces'
        };

        if (params.spaceId) {
            this.setSpaceId(params.spaceId);
        }

        this.authorizationUri = encodeURI(
            `https://be.contentful.com/oauth/authorize?response_type=token` +
            `&scope=${this.scope}` +
            `&client_id=${this.client_id}` +
            `&redirect_uri=${this.redirect_uri}`
        );
        this.tokenUri = 'https://be.contentful.com/oauth/token';
    }

    setSpaceId(spaceId) {
        this.spaceId = spaceId;

        this.URLs.environments = `${this.baseUrl}spaces/${this.spaceId}/environments`;
        this.URLs.contentTypes = `${this.baseUrl}spaces/${this.spaceId}/environments/${this.envId}/content_types`;
        this.URLs.contentType = (id) => `${this.baseUrl}spaces/${this.spaceId}/environments/${this.envId}/content_types/${id}`;
        this.URLs.locales = `${this.baseUrl}spaces/${this.spaceId}/environments/${this.envId}/locales`;
        this.URLs.entries = `${this.baseUrl}spaces/${this.spaceId}/environments/${this.envId}/entries`;
        this.URLs.publishedEntries = `${this.baseUrl}spaces/${this.spaceId}/environments/${this.envId}/public/entries`;
        this.URLs.entry = (entryId) => `${this.baseUrl}spaces/${this.spaceId}/environments/${this.envId}/entries/${entryId}`;
        this.URLs.publishEntry = (entryId) => `${this.baseUrl}spaces/${this.spaceId}/environments/${this.envId}/entries/${entryId}/published`;
    }

    async _get(options) {
        return JSON.parse(await super._get(options));
    }

    async getUser() {
        const options = {
            url: this.URLs.me,
        };
        return this._get(options);
    }

    async getTokenIdentity() {
        const user = await this.getUser();
        return {
            identifier: user.sys.id,
            name: `${user.firstName} ${user.lastName}`
        };
    }

    async getSpaces() {
        const options = {
            url: this.URLs.spaces,
        };
        return this._get(options);
    }

    async getEnvironments() {
        const options = {
            url: this.URLs.environments,
        }
        return this._get(options);
    }

    async getContentTypes() {
        const options = {
            url: this.URLs.contentTypes
        }
        return this._get(options);
    }

    async getLocales() {
        const options = {
            url: this.URLs.locales
        }
        return this._get(options);
    }

    async getEntries(query) {
        const options = {
            url: this.URLs.entries,
            query
        }
        return this._get(options);
    }

    async getEntriesByContentType(type) {
        const options = {
            url: this.URLs.entries,
            query: {
                'content_type': type
            }
        }
        return this._get(options);
    }

    async getPublishedEntries() {
        const options = {
            url: this.URLs.publishedEntries,
        }
        return this._get(options);
    }

    async createEntry(body, contentType) {
        const options = {
            url: this.URLs.entries,
            headers: {
                'X-Contentful-Content-Type': contentType,
                'Content-Type': 'application/json'
            },
            body
        }
        return JSON.parse(await this._post(options));
    }

    async publishEntry(entryId, version) {
        const options = {
            url: this.URLs.publishEntry(entryId),
            headers: {
                'X-Contentful-Version': version,
            },
        }
        return JSON.parse(await this._put(options));
    }

    async unpublishEntry(entryId, version) {
        const options = {
            url: this.URLs.publishEntry(entryId),
            headers: {
                'X-Contentful-Version': version,
            },
        }
        return this._delete(options);
    }

    async getEntry(entryId) {
        const options = {
            url: this.URLs.entry(entryId),
        }
        return this._get(options);
    }

    async getContentType(contentTypeId) {
        const options = {
            url: this.URLs.contentType(contentTypeId),
        }
        return this._get(options);
    }

    async jsonPatchEntry(entryId, body, version) {
        const options = {
            url: this.URLs.entry(entryId),
            headers: {
                'X-Contentful-Version': version,
                'Content-Type': 'application/json-patch+json'
            },
            body
        }
        return JSON.parse(await this._patch(options));
    }

    async updateEntry(entryId, body, version) {
        const options = {
            url: this.URLs.entry(entryId),
            headers: {
                'X-Contentful-Version': version,
                'Content-Type': 'application/json'
            },
            body
        }
        return JSON.parse(await this._put(options));
    }

    async deleteEntry(entryId) {
        const options = {
            url: this.URLs.entry(entryId),
        }
        return this._delete(options);
    }
}

module.exports = { Api };
