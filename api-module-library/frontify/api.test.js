const Authenticator = require('@friggframework/test-environment/Authenticator');
const nock = require('nock');
const { Api } = require('./api');
const Config = require('./defaultConfig');

describe(`${Config.label} API Tests`, () => {
    const baseUrl = 'https://domain-mine/graphql';

    describe('#constructor', () => {
        describe('Create new API with params', () => {
            let api;

            beforeEach(() => {
                const params = {
                    domain: 'domain',
                };

                api = new Api(params);
            });

            it('should have all properties filled', () => {
                expect(api.domain).toEqual('domain');
                expect(api.baseUrl).toEqual('https://domain/graphql');
                expect(api.tokenUri).toEqual('https://domain/api/oauth/accesstoken');
            });
        });

        describe('Create new API without params', () => {
            let api;

            beforeEach(() => {
                api = new Api();
            });

            it('should have all properties filled', () => {
                expect(api.domain).toBeNull();
                expect(api.baseUrl).not.toBeDefined();
                expect(api.tokenUri).not.toBeDefined();
            });
        });

        describe('Create new API with access token', () => {
            let api;

            beforeEach(() => {
                api = new Api({ access_token: 'access_token' });
            });

            it('should pass params to parent', () => {
                expect(api.access_token).toEqual('access_token');
            });
        });
    });

    describe('#setDomain', () => {
        describe('Set domain', () => {
            let api;

            beforeEach(() => {
                api = new Api();
            });

            it('should set property', () => {
                api.setDomain('my-domain');
                expect(api.domain).toEqual('my-domain');
                expect(api.baseUrl).toEqual('https://my-domain/graphql');
                expect(api.tokenUri).toEqual('https://my-domain/api/oauth/accesstoken');
            });
        });
    });

    describe('#getAuthUri', () => {
        describe('Get with domain property present', () => {
            let api;

            beforeEach(() => {
                api = new Api({
                  client_id: 'client_id',
                  redirect_uri: 'redirect_uri',
                  scope: 'scope',
                  state: 'state',
                  domain: 'other-domain',
                });
            });

            it('should include domain in URL', () => {
                const link = 'https://other-domain/'
                      + 'api/oauth/authorize?'
                      + 'client_id=client_id&response_type=code&redirect_uri=redirect_uri&scope=scope&state=state';
                expect(api.getAuthUri()).toEqual(link);
            });
        });

        describe('Get without domain property present', () => {
            let api;

            beforeEach(() => {
                api = new Api({
                  client_id: 'client_id',
                  redirect_uri: 'redirect_uri',
                  scope: 'scope',
                  state: 'state'
                });
            });

            it('should include domain in URL', () => {
                const link = 'https://{{domain}}/'
                      + 'api/oauth/authorize?'
                      + 'client_id=client_id&response_type=code&redirect_uri=redirect_uri&scope=scope&state=state';
                expect(api.getAuthUri()).toEqual(link);
            });
        });
    });

    describe('#buildRequestOptions', () => {
        describe('Pass in graph query language', () => {
            let api;

            beforeEach(() => {
                api = new Api({
                  client_id: 'client_id',
                  redirect_uri: 'redirect_uri',
                  scope: 'scope',
                  state: 'state'
                });
            });

            it('should return options for doing request', () => {
                expect(api.buildRequestOptions('my query')).toEqual({
                    url: this.baseUrl,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: {
                        query: 'my query'
                    },
                });
            });
        });
    });

    describe('HTTP Requests', () => {
        let api;

        beforeAll(() => {
            api = new Api({
                domain: 'domain-mine'
            });
        });

        afterEach(() => {
            nock.cleanAll();
        });

        describe('#getUser', () => {
            describe('Retrieve information about the user', () => {
                let scope;

                beforeEach(() => {
                    const ql = `query CurrentUser {
                                   currentUser {
                                     id
                                     email
                                     name
                                   }
                                 }`;

                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                currentUser: 'currentUser'
                            }
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const user = await api.getUser();
                    expect(user).toEqual({ user: 'currentUser' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });

        describe('#listBrands', () => {
            describe('Retrieve information about brands', () => {
                let scope;

                beforeEach(() => {
                    const ql = `query Brands {
                                  brands {
                                    id
                                    avatar
                                    name
                                  }
                                }`;

                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                brands: 'brands'
                            }
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const brands = await api.listBrands();
                    expect(brands).toEqual({ brands: 'brands' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });

        describe('#listProjects', () => {
            describe('Retrieve information about projects', () => {
                let scope;

                beforeEach(() => {
                    const ql = `query Projects {
                                  brand(id: "brandId") {
                                    workspaceProjects {
                                      items {
                                        id
                                        name
                                      }
                                    }
                                  }
                                }`;

                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                brand: {
                                    workspaceProjects: {
                                        items: 'items'
                                    }
                                }
                            }
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const projects = await api.listProjects({ brandId: 'brandId' });
                    expect(projects).toEqual({ projects: 'items' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });

        describe('#listLibraries', () => {
            describe('Retrieve information about libraries', () => {
                let scope;

                beforeEach(() => {
                    const ql = `query Libraries {
                                  brand(id: "brandId") {
                                    libraries {
                                      items {
                                        id
                                        name
                                      }
                                    }
                                  }
                                }`;

                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                brand: {
                                    libraries: {
                                        items: {
                                            libraries: 'libraries'
                                        }
                                    }
                                }
                            }
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const libraries = await api.listLibraries({ brandId: 'brandId' });
                    expect(libraries).toEqual({ libraries: 'libraries' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });

        describe('#listProjectAssets', () => {
            describe('Retrieve information about a project\'s assets', () => {
                let scope;

                beforeEach(() => {
                    const ql = `query ProjectAssets {
                                  workspaceProject(id: "projectId") {
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

                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                workspaceProject: {
                                    assets: {
                                        items: 'items'
                                    }
                                }
                            }
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const projectAssets = await api.listProjectAssets({ projectId: 'projectId' });
                    expect(projectAssets).toEqual({ assets: 'items' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });

        describe('#listProjectFolders', () => {
            describe('Retrieve information about a project\'s folders', () => {
                let scope;

                beforeEach(() => {
                    const ql = `query ProjectFolders {
                                  workspaceProject(id: "projectId") {
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

                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                workspaceProject: {
                                    browse: {
                                        folders: {
                                            items: 'items'
                                        }
                                    }
                                }
                            }
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const projectFolders = await api.listProjectFolders({ projectId: 'projectId' });
                    expect(projectFolders).toEqual({ folders: 'items' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });

        describe('#listLibraryAssets', () => {
            describe('Retrieve information about a library\'s assets', () => {
                let scope;

                beforeEach(() => {
                    const ql = `query LibraryAssets {
                                  library(id: "libraryId") {
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

                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                library: {
                                    assets: {
                                        items: 'items'
                                    }
                                }
                            }
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const libraryAssets = await api.listLibraryAssets({ libraryId: 'libraryId' });
                    expect(libraryAssets).toEqual({ assets: 'items' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });

        describe('#listLibraryFolders', () => {
            describe('Retrieve information about a library\'s folders', () => {
                let scope;

                beforeEach(() => {
                    const ql = `query LibraryFolders {
                                  library(id: "libraryId") {
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

                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                library: {
                                    browse: {
                                        folders: {
                                            items: 'items'
                                        }
                                    }
                                }
                            }
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const libraryFolders = await api.listLibraryFolders({ libraryId: 'libraryId' });
                    expect(libraryFolders).toEqual({ folders: 'items' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });
    });
});
