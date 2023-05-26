const { get } = require('@friggframework/assertions');
const { OAuth2Requester } = require('@friggframework/module-plugin');
const querystring = require('querystring');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.domain = get(params, 'domain', null);
        this.baseUrl = `https://${this.domain}/graphql`;
        this.tokenUri = `https://${this.domain}/api/oauth/accesstoken`;
    }

    setDomain(domain) {
        this.domain = domain;
    }

    getAuthUri() {
        const query = {
            client_id: this.client_id,
            response_type: 'code',
            redirect_uri: this.redirect_uri,
            scope: this.scope,
            state: this.state,
        };

        let authorizationUri;

        if (this.domain) {
            authorizationUri = `https://${this.domain}/api/oauth/authorize`;
        } else {
            authorizationUri = 'https://{{domain}}/api/oauth/authorize';
        }

        return `${authorizationUri}?${querystring.stringify(query)}`;
    }

    async getUser() {
        const options = {
            url: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
            },
            body: {
                query: 'query CurrentUser { currentUser { id email name }}',
            },
        };

        const response = await this._post(options);
        return {
            user: response.data.currentUser,
        };
    }

    async listBrands() {
        const options = {
            url: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
            },
            body: {
                query: 'query Brands { brands { id avatar name }}',
            },
        };

        const response = await this._post(options);
        return response.data;
    }

    async listProjects(query) {
        const options = {
            url: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
            },
            body: {
                query: `query Projects { brand(id: "${query.brandId}") { workspaceProjects { items { id name }}}}`,
            },
        };

        const response = await this._post(options);
        return {
            projects: response.data.brand.workspaceProjects.items,
        };
    }

    async listLibraries(query) {
        const options = {
            url: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
            },
            body: {
                query: `query Libraries { brand(id: "${query.brandId}") { libraries { items { id name }}}}`,
            },
        };

        const response = await this._post(options);
        return response.data.brand.libraries.items;
    }

    async listProjectAssets(query) {
        const options = {
            url: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
            },
            body: {
                query: `query ProjectAssets { workspaceProject(id: "${query.projectId}") { assets { items { id title description }}}}`,
            },
        };

        const response = await this._post(options);
        return {
            assets: response.data.workspaceProject.assets.items,
        };
    }

    async listLibraryAssets(query) {
        const options = {
            url: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
            },
            body: {
                query: `query LibraryAssets { library(id: "${query.libraryId}") { assets { items { id title description }}}}`,
            },
        };

        const response = await this._post(options);
        return {
            assets: response.data.library.assets.items,
        };
    }
}

module.exports = { Api };
