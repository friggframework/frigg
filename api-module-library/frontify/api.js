const { get } = require('@friggframework/assertions');
const { OAuth2Requester } = require('@friggframework/module-plugin');
const querystring = require('querystring');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.domain = get(params, 'domain', null);

        if (this.domain) {
            this.baseUrl = `https://${this.domain}/graphql`;
            this.tokenUri = `https://${this.domain}/api/oauth/accesstoken`;
        }
    }

    setDomain(domain) {
        this.domain = domain;
        this.baseUrl = `https://${this.domain}/graphql`;
        this.tokenUri = `https://${this.domain}/api/oauth/accesstoken`;
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

    buildRequestOptions(query) {
        return {
            url: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
            },
            body: {
                query
            },
        };
    }

    async getUser() {
        const query = `query CurrentUser {
                         currentUser {
                           id
                           email
                           name
                         }
                       }`;

        const response = await this._post(this.buildRequestOptions(query));
        return {
            user: response.data.currentUser,
        };
    }

    async listBrands() {
        const ql = `query Brands {
                      brands {
                        id
                        avatar
                        name
                      }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        return response.data;
    }

    async listProjects(query) {
        const ql = `query Projects {
                      brand(id: "${query.brandId}") {
                        workspaceProjects {
                          items {
                            id
                            name
                          }
                        }
                      }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        return {
            projects: response.data.brand.workspaceProjects.items,
        };
    }

    async listLibraries(query) {
        const ql = `query Libraries {
                      brand(id: "${query.brandId}") {
                        libraries {
                          items {
                            id
                            name
                          }
                        }
                      }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        return response.data.brand.libraries.items;
    }

    async listProjectAssets(query) {
        const ql = `query ProjectAssets {
                      workspaceProject(id: "${query.projectId}") {
                        assets {
                          items {
                            id
                            title
                            description
                            __typename
                          }
                        }
                      }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        return {
            assets: response.data.workspaceProject.assets.items,
        };
    }

    async listLibraryAssets(query) {
        const ql = `query LibraryAssets {
                      library(id: "${query.libraryId}") {
                        assets {
                          items {
                            id
                            title
                            description
                            __typename
                          }
                        }
                      }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        return {
            assets: response.data.library.assets.items,
        };
    }
}

module.exports = { Api };
