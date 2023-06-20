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
            const ql = `query CurrentUser {
                           currentUser {
                             id
                             email
                             name
                           }
                         }`;

            describe('Retrieve information about the user', () => {
                let scope;

                beforeEach(() => {
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

            describe('Get error coming from user endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            errors: [
                                {
                                    message: 'An error getting user happened!',
                                    locations: [
                                        {
                                            line: 1,
                                            column: 1
                                        }
                                    ],
                                    extensions: {
                                        category: 'graphql'
                                    }
                                }
                            ],
                            data: null,
                            extensions: {
                                complexityScore: 0
                            }
                        });
                });

                it('should handle error', () => {
                    expect(
                        async () => await api.getUser()
                    ).rejects.toThrow(new Error('An error getting user happened!'));
                });
            });
        });

        describe('#getAsset', () => {
            const commonProps = [
                'description',
                'downloadUrl',
                'filename',
                'previewUrl',
                'size',
            ];

            const dimensionProps = [
                'height',
                'width',
            ];

            const ql = `query Asset {
                          asset(id: "assetId") {
                            id
                            title
                            status
                            __typename
                            tags {
                              value
                            }
                            ... on Audio {
                              ${commonProps.join(' ')}
                            }
                            ... on Document {
                              ${commonProps.join(' ')}
                              ${dimensionProps.join(' ')}
                            }
                            ... on File {
                              ${commonProps.join(' ')}
                            }
                            ... on Image {
                              ${commonProps.join(' ')}
                              ${dimensionProps.join(' ')}
                            }
                            ... on Video {
                              ${commonProps.join(' ')}
                              ${dimensionProps.join(' ')}
                              duration
                              bitrate
                            }
                            ... on EmbeddedContent {
                              description
                              previewUrl
                              status
                            }
                          }
                        }`;

            describe('Retrieve information about an asset', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                asset: {
                                    asset: 'asset'
                                }
                            }
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const asset = await api.getAsset({ assetId: 'assetId' });
                    expect(asset).toEqual({ asset: 'asset' });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get error coming from asset endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            errors: [
                                {
                                    message: 'An error getting asset happened!',
                                    locations: [
                                        {
                                            line: 1,
                                            column: 1
                                        }
                                    ],
                                    extensions: {
                                        category: 'graphql'
                                    }
                                }
                            ],
                            data: null,
                            extensions: {
                                complexityScore: 0
                            }
                        });
                });

                it('should handle error', () => {
                    expect(
                        async () => await api.getAsset({ assetId: 'assetId' })
                    ).rejects.toThrow(new Error('An error getting asset happened!'));
                });
            });
        });

        describe('#getSearchFilterOptions', () => {
            describe('Retrieve searh and filter available options', () => {
                it('should return options', async () => {
                    const options = await api.getSearchFilterOptions();
                    expect(options).toEqual({
                        status: ['FINISHED', 'PROCESSING', 'PROCESSING_FAILED'],
                        fileTypes: [
                            'Audio',
                            'Document',
                            'File',
                            'Image',
                            'Video',
                            'EmbeddedContent'
                        ]
                    });
                });
            });
        });

        describe('#listBrands', () => {
            const ql = `query Brands {
                           brands {
                             id
                             avatar
                             name
                           }
                         }`;

            describe('Retrieve information about brands', () => {
                let scope;

                beforeEach(() => {
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

            describe('Get error coming from brands endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            errors: [
                                {
                                    message: 'An error getting brands happened!',
                                    locations: [
                                        {
                                            line: 1,
                                            column: 1
                                        }
                                    ],
                                    extensions: {
                                        category: 'graphql'
                                    }
                                }
                            ],
                            data: null,
                            extensions: {
                                complexityScore: 0
                            }
                        });
                });

                it('should handle error', () => {
                    expect(
                        async () => await api.listBrands()
                    ).rejects.toThrow(new Error('An error getting brands happened!'));
                });
            });
        });

        describe('#listProjects', () => {
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

            describe('Retrieve information about projects', () => {
                let scope;

                beforeEach(() => {
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

            describe('Get error coming from projects endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            errors: [
                                {
                                    message: 'An error getting projects happened!',
                                    locations: [
                                        {
                                            line: 1,
                                            column: 1
                                        }
                                    ],
                                    extensions: {
                                        category: 'graphql'
                                    }
                                }
                            ],
                            data: null,
                            extensions: {
                                complexityScore: 0
                            }
                        });
                });

                it('should handle error', () => {
                    expect(
                        async () => await api.listProjects({ brandId: 'brandId' })
                    ).rejects.toThrow(new Error('An error getting projects happened!'));
                });
            });
        });

        describe('#listLibraries', () => {
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

            describe('Retrieve information about libraries', () => {
                let scope;

                beforeEach(() => {
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

            describe('Get error coming from libraries endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            errors: [
                                {
                                    message: 'An error getting libraries happened!',
                                    locations: [
                                        {
                                            line: 1,
                                            column: 1
                                        }
                                    ],
                                    extensions: {
                                        category: 'graphql'
                                    }
                                }
                            ],
                            data: null,
                            extensions: {
                                complexityScore: 0
                            }
                        });
                });

                it('should handle error', () => {
                    expect(
                        async () => await api.listLibraries({ brandId: 'brandId' })
                    ).rejects.toThrow(new Error('An error getting libraries happened!'));
                });
            });
        });

        describe('#listProjectAssets', () => {
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

            describe('Retrieve information about a project\'s assets', () => {
                let scope;

                beforeEach(() => {
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

            describe('Get error coming from a project\'s assets endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            errors: [
                                {
                                    message: 'An error getting project assets happened!',
                                    locations: [
                                        {
                                            line: 1,
                                            column: 1
                                        }
                                    ],
                                    extensions: {
                                        category: 'graphql'
                                    }
                                }
                            ],
                            data: null,
                            extensions: {
                                complexityScore: 0
                            }
                        });
                });

                it('should handle error', () => {
                    expect(
                        async () => await api.listProjectAssets({ projectId: 'projectId' })
                    ).rejects.toThrow(new Error('An error getting project assets happened!'));
                });
            });
        });

        describe('#listProjectFolders', () => {
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

            describe('Retrieve information about a project\'s folders', () => {
                let scope;

                beforeEach(() => {
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

            describe('Get error coming from a project\'s folders endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            errors: [
                                {
                                    message: 'An error getting project folders happened!',
                                    locations: [
                                        {
                                            line: 1,
                                            column: 1
                                        }
                                    ],
                                    extensions: {
                                        category: 'graphql'
                                    }
                                }
                            ],
                            data: null,
                            extensions: {
                                complexityScore: 0
                            }
                        });
                });

                it('should handle error', () => {
                    expect(
                        async () => await api.listProjectFolders({ projectId: 'projectId' })
                    ).rejects.toThrow(new Error('An error getting project folders happened!'));
                });
            });
        });

        describe('#listLibraryAssets', () => {
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

            describe('Retrieve information about a library\'s assets', () => {
                let scope;

                beforeEach(() => {
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

            describe('Get error coming from a library\'s assets endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            errors: [
                                {
                                    message: 'An error getting library assets happened!',
                                    locations: [
                                        {
                                            line: 1,
                                            column: 1
                                        }
                                    ],
                                    extensions: {
                                        category: 'graphql'
                                    }
                                }
                            ],
                            data: null,
                            extensions: {
                                complexityScore: 0
                            }
                        });
                });

                it('should handle error', () => {
                    expect(
                        async () => await api.listLibraryAssets({ libraryId: 'libraryId' })
                    ).rejects.toThrow(new Error('An error getting library assets happened!'));
                });
            });
        });

        describe('#listLibraryFolders', () => {
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

            describe('Retrieve information about a library\'s folders', () => {
                let scope;

                beforeEach(() => {
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

            describe('Get error coming from a library\'s folders endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            errors: [
                                {
                                    message: 'An error getting library folders happened!',
                                    locations: [
                                        {
                                            line: 1,
                                            column: 1
                                        }
                                    ],
                                    extensions: {
                                        category: 'graphql'
                                    }
                                }
                            ],
                            data: null,
                            extensions: {
                                complexityScore: 0
                            }
                        });
                });

                it('should handle error', () => {
                    expect(
                        async () => await api.listLibraryFolders({ libraryId: 'libraryId' })
                    ).rejects.toThrow(new Error('An error getting library folders happened!'));
                });
            });
        });

        describe('#searchInBrand', () => {
            const ql = `query BrandLevelSearch {
                          brand(id: "brandId") {
                            id
                            name
                            search(page: 1, limit: limit, query: {term: "term"}) {
                              total
                              edges {
                                title
                                node {
                                  ... on Asset {
                                    id,
                                  modifiedAt,
                                  description,
                                  createdAt,
                                  tags {
                                    source,
                                    value,
                                  },
                                  metadataValues {
                                    id
                                  },
                                    externalId,
                                    title,
                                    status,
                                    __typename,
                                    creator {
                                      id,
                                      name,
                                      email
                                    }

                                  },
                                  ... on Image {
                                    previewUrl,
                                    extension
                                    downloadUrl(validityInDays: null, permanent: true)
                                    author,

                                  }

                                }
                              }
                            }
                          }
                        }`;

            describe('Retrieve information when searching in Brand', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                brand: {
                                    id: "eyJpZGVudGlmaWVyIjoxLCJ0eXBlIjoiYnJhbmQifQ==",
                                    name: "Left Hook",
                                    search: {
                                        total: 1,
                                        edges: 'edges'
                                    }
                                }
                            }
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const query = {
                        brandId: 'brandId',
                        limit: 'limit',
                        term: 'term'
                    };

                    const results = await api.searchInBrand(query);
                    expect(results).toEqual({ assets: 'edges' });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get incoming error when searching', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            errors: [
                                {
                                    message: 'An error searching brand happened!',
                                    locations: [
                                        {
                                            line: 1,
                                            column: 1
                                        }
                                    ],
                                    extensions: {
                                        category: 'graphql'
                                    }
                                }
                            ],
                            data: null,
                            extensions: {
                                complexityScore: 0
                            }
                        });
                });

                it('should handle error', () => {
                    const query = {
                        brandId: 'brandId',
                        limit: 'limit',
                        term: 'term'
                    };

                    expect(
                        async () => await api.searchInBrand(query)
                    ).rejects.toThrow(new Error('An error searching brand happened!'));
                });
            });
        });
    });
});
