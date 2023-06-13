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

    assertResponse(response) {
        if (response.errors) {
            const { errors } = response;
            throw new Error(errors[0].message);
        }
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
        this.assertResponse(response);
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
        this.assertResponse(response);
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
        this.assertResponse(response);
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
        this.assertResponse(response);
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
        this.assertResponse(response);
        return {
            assets: response.data.workspaceProject.assets.items,
        };
    }

    async listProjectFolders(query) {
        const ql = `query ProjectFolders {
                      workspaceProject(id: "${query.projectId}") {
                        browse {
                          folders {
                            items {
                              id
                              name
                              __typename
                            }
                          }
                        }
                      }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        this.assertResponse(response);
        return {
            folders: response.data.workspaceProject.browse.folders.items
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
        this.assertResponse(response);
        return {
            assets: response.data.library.assets.items,
        };
    }

    async listLibraryFolders(query) {
        const ql = `query LibraryFolders {
                      library(id: "${query.libraryId}") {
                        browse {
                          folders {
                            items {
                              id
                              name
                              __typename
                            }
                          }
                        }
                      }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        this.assertResponse(response);
        return {
            folders: response.data.library.browse.folders.items
        };
    }
}

module.exports = { Api };
