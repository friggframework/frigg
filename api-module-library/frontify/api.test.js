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
                expect(api.tokenRefresh).toEqual('https://domain/api/oauth/refresh');
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
                expect(api.tokenRefresh).not.toBeDefined();
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
                expect(api.tokenRefresh).toEqual('https://my-domain/api/oauth/refresh');
            });
        });
    });

    describe('#getRefreshAccessToken', () => {
        describe('Get refresh access token', () => {
            let api;
            let scope;
            const url = 'https://my-domain';

            beforeEach(() => {
                api = new Api({
                    domain: 'my-domain',
                });

                scope = nock(url)
                    .post('/api/oauth/refresh')
                    .reply(200, {
                        access_token: 'access_token',
                        refresh_token: 'refresh_token',
                        expires_in: 'expires_in'
                    });
            });

            it('should get refresh access token', async () => {
                api.access_token = 'foobar';
                const response = await api.refreshAccessToken({refresh_token: 'refresh_token'});
                expect(response).toBeTruthy();
                expect(api.access_token).not.toEqual('foobar');
                expect(api.refresh_token).toEqual('refresh_token');
                expect(api.tokenRefresh).toEqual(`${url}/api/oauth/refresh`);
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
        const api = new Api({
            domain: 'domain-mine'
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
                        .post('', (body) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                currentUser: 'currentUser'
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const user = await api.getUser();
                    expect(user).toEqual({ user: 'currentUser' });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get error coming from user endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
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
            const ql = `query Asset {
                          asset(id: "assetId") {
                            id
                            title
                            status
                            __typename
                            tags {
                              source
                              value
                            }
                            ${api._filesQuery()}
                          }
                        }`;

            describe('Retrieve information about an asset', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                asset: {
                                    asset: 'asset'
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const asset = await api.getAsset({ assetId: 'assetId' });
                    expect(asset).toEqual({ asset: 'asset' });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get error coming from asset endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
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

        describe('#getAssetPermissions', () => {
            const ql = `query AssetPermissions {
                          asset(id: "assetId") {
                              currentUserPermissions {
                                canEdit
                                canDelete
                                canComment
                                canDownload
                              }
                            }
                        }`;

            describe('Retrieve permissions for an asset', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                asset: {
                                    currentUserPermissions: 'currentUserPermissions'
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const permissions = await api.getAssetPermissions({ assetId: 'assetId' });
                    expect(permissions).toEqual({ permissions: 'currentUserPermissions' });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get error coming from permissions endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            errors: [
                                {
                                    message: 'An error getting asset permissions happened!',
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
                        async () => await api.getAssetPermissions({ assetId: 'assetId' })
                    ).rejects.toThrow(new Error('An error getting asset permissions happened!'));
                });
            });
        });

        describe('#getLibraryPermissions', () => {
            const ql = `query LibraryPermissions {
                          library(id: "libraryId") {
                              currentUserPermissions {
                                canCreateAssets
                                canViewCollaborators
                                canCreateCollections
                              }
                            }
                        }`;

            describe('Retrieve permissions for a library', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                library: {
                                    currentUserPermissions: 'currentUserPermissions'
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const permissions = await api.getLibraryPermissions({ libraryId: 'libraryId' });
                    expect(permissions).toEqual({ permissions: 'currentUserPermissions' });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get error coming from permissions endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            errors: [
                                {
                                    message: 'An error getting library permissions happened!',
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
                        async () => await api.getLibraryPermissions({ libraryId: 'libraryId' })
                    ).rejects.toThrow(new Error('An error getting library permissions happened!'));
                });
            });
        });

        describe('#getProjectPermissions', () => {
            const ql = `query ProjectPermissions {
                          workspaceProject(id: "projectId") {
                              currentUserPermissions {
                                canCreateAssets
                                canViewCollaborators
                              }
                            }
                        }`;

            describe('Retrieve permissions for a project', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                workspaceProject: {
                                    currentUserPermissions: 'currentUserPermissions'
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const permissions = await api.getProjectPermissions({ projectId: 'projectId' });
                    expect(permissions).toEqual({ permissions: 'currentUserPermissions' });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get error coming from permissions endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            errors: [
                                {
                                    message: 'An error getting project permissions happened!',
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
                        async () => await api.getProjectPermissions({ projectId: 'projectId' })
                    ).rejects.toThrow(new Error('An error getting project permissions happened!'));
                });
            });
        });

        describe('#listBrandPermissions', () => {
            const ql = `query Brands {
                          brand(id: "brandId") {
                            libraries {
                              items {
                                id
                                name
                                currentUserPermissions {
                                  canCreateAssets
                                  canViewCollaborators
                                  canCreateCollections
                                }
                              }
                            }
                            workspaceProjects{
                              items{
                                id
                                name
                                currentUserPermissions{
                                  canCreateAssets
                                  canViewCollaborators
                                }
                              }
                            }
                          }
                        }`;

            describe('Retrieve all permissions in a brand', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                brand: {
                                    workspaceProjects: {
                                        items: [{
                                            id: 'project_id',
                                            name: 'project_name',
                                            currentUserPermissions: 'project_permissiones'
                                        }]
                                    },
                                    libraries: {
                                        items: [{
                                            id: 'library_id',
                                            name: 'library_name',
                                            currentUserPermissions: 'library_permissiones'
                                        }]
                                    }
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const permissions = await api.listBrandPermissions({ brandId: 'brandId' });
                    expect(permissions).toEqual({
                        libraries: [{
                            id: 'library_id',
                            name: 'library_name',
                            permissions: 'library_permissiones'
                        }],
                        projects: [{
                            id: 'project_id',
                            name: 'project_name',
                            permissions: 'project_permissiones'
                        }]
                    });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get error coming from permissions endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            errors: [
                                {
                                    message: 'An error getting brand permissions happened!',
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
                        async () => await api.listBrandPermissions({ brandId: 'brandId' })
                    ).rejects.toThrow(new Error('An error getting brand permissions happened!'));
                });
            });
        });

        describe('#getSearchFilterOptions', () => {
            describe('Retrieve search and filter available options', () => {
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
                        .post('', (body) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                brands: 'brands'
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const brands = await api.listBrands();
                    expect(brands).toEqual({ brands: 'brands' });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get error coming from brands endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
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
            const buildQl = (page, limit) => `
                              query Projects {
                                brand(id: "brandId") {
                                  workspaceProjects(page: ${page || 1}, limit: ${limit || 25}) {
                                    items {
                                      id
                                      name
                                      currentUserPermissions {
                                        canCreateAssets
                                        canViewCollaborators
                                      }
                                    }
                                    total
                                    page
                                    hasNextPage
                                  }
                                }
                              }`;

            describe('Retrieve information about projects', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === buildQl().replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                brand: {
                                    workspaceProjects: {
                                        items: 'items',
                                        total: 'total',
                                        page: 'page',
                                        hasNextPage: 'hasNextPage'
                                    },
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const projects = await api.listProjects({ brandId: 'brandId' });
                    expect(projects).toEqual({
                        items: 'items',
                        total: 'total',
                        page: 'page',
                        hasNextPage: 'hasNextPage'
                    });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Retrieve information about projects using pagination', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === buildQl(10, 50).replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                brand: {
                                    workspaceProjects: {
                                        items: 'items',
                                        total: 'total',
                                        page: 'page',
                                        hasNextPage: 'hasNextPage'
                                    },
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const projects = await api.listProjects({
                        brandId: 'brandId',
                        page: 10,
                        limit: 50
                    });
                    expect(projects).toEqual({
                        items: 'items',
                        total: 'total',
                        page: 'page',
                        hasNextPage: 'hasNextPage'
                    });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get error coming from projects endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === buildQl().replace(/\s/g, ''))
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

        describe('#listCollectionsAssetsForLibrary', () => {
            const buildQl = (page, limit) => `
                              query ListCollectionsAssetsForLibrary {
                                library(id: "libraryId") {
                                  id
                                  name
                                  collections {
                                    items {
                                      id
                                      name
                                      __typename
                                      assets(page: ${page || 1}, limit: ${limit || 25}) {
                                        items	{
                                          id
                                          title
                                          description
                                          tags {
                                            source
                                            value
                                          }
                                          __typename
                                          ${api._filesQuery()}
                                        }
                                        total
                                        page
                                        hasNextPage
                                      }
                                    }
                                  }
                                }
                              }`;

            describe('Retrieve information about assets', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === buildQl().replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                library: {
                                    id: 'id',
                                    name: 'name',
                                    collections: {
                                        items: [{
                                            id: 'collectionId',
                                            name: 'Test collection',
                                            __typename: 'Collection',
                                            assets:	{
                                                items:	[{
                                                    id: 'id',
                                                    title: 'title',
                                                    description: 'description',
                                                    tags: [{
                                                        source: 'source',
                                                        value: 'value'
                                                    }],
                                                    __typename: 'Image'
                                                }],
                                                total: 'total',
                                                page: 'page',
                                                hasNextPage: 'hasNextPage'
                                            }
                                        }]
                                    }
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const collection = await api.listCollectionsAssets({ libraryId: 'libraryId', collectionId: 'collectionId' });
                    expect(collection.items).toEqual([{ id: 'id', title: 'title', description: 'description', tags: [{ source: 'source', value: 'value' }], __typename: 'Image' }]);
                    expect(collection.total).toEqual('total');
                    expect(collection.page).toEqual('page');
                    expect(collection.hasNextPage).toEqual('hasNextPage');
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Retrieve information about assets using pagination', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === buildQl(5, 50).replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                library: {
                                    id: 'id',
                                    name: 'name',
                                    collections: {
                                        items: [{
                                            id: 'collectionId',
                                            name: 'Test collection',
                                            __typename: 'Collection',
                                            assets:	{
                                                items:	[{
                                                    id: 'id',
                                                    title: 'title',
                                                    description: 'description',
                                                    tags: [{
                                                        source: 'source',
                                                        value: 'value'
                                                    }],
                                                    __typename: 'Image'
                                                }],
                                                total: 'total',
                                                page: 'page',
                                                hasNextPage: 'hasNextPage'
                                            }
                                        }]
                                    }
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const collection = await api.listCollectionsAssets({
                        libraryId: 'libraryId',
                        collectionId: 'collectionId',
                        page: 5,
                        limit: 50
                    });
                    expect(collection.items).toEqual([{ id: 'id', title: 'title', description: 'description', tags: [{ source: 'source', value: 'value' }], __typename: 'Image' }]);
                    expect(collection.total).toEqual('total');
                    expect(collection.page).toEqual('page');
                    expect(collection.hasNextPage).toEqual('hasNextPage');
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get error coming from collections endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === buildQl().replace(/\s/g, ''))
                        .reply(200, {
                            errors: [
                                {
                                    message: 'An error getting assets happened!',
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
                        async () => await api.listCollectionsAssets({ libraryId: 'libraryId', collectionId: 'collectionId' })
                    ).rejects.toThrow(new Error('An error getting assets happened!'));
                });
            });

            describe('Get error when collection not found in response', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === buildQl().replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                library: {
                                    id: 'id',
                                    name: 'name',
                                    collections: {
                                        items: [{
                                            id: 'otherId',
                                            name: 'Test collection',
                                            __typename: 'Collection',
                                            assets:	{
                                                items:	[{
                                                    id: 'id',
                                                    title: 'title',
                                                    description: 'description',
                                                    tags: [{
                                                        source: 'source',
                                                        value: 'value'
                                                    }],
                                                    __typename: 'Image'
                                                }],
                                                total: 'total',
                                                page: 'page',
                                                hasNextPage: 'hasNextPage'
                                            }
                                        }]
                                    }
                                }
                            }
                        });
                });

                it('should handle error', () => {
                    expect(
                        async () => await api.listCollectionsAssets({ libraryId: 'libraryId', collectionId: 'collectionId' })
                    ).rejects.toThrow(new Error('Collection not found'));
                });
            });
        });

        describe('#listLibraries', () => {
            const buildQl = (page, limit) => `
                              query Libraries {
                                brand(id: "brandId") {
                                  libraries(page: ${page || 1}, limit: ${limit || 25}) {
                                    items {
                                      id
                                      name
                                      currentUserPermissions {
                                        canCreateAssets
                                        canViewCollaborators
                                        canCreateCollections
                                      }
                                    }
                                    total
                                    page
                                    hasNextPage
                                  }
                                }
                              }`;

            describe('Retrieve information about libraries', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === buildQl().replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                brand: {
                                    libraries: {
                                        items: 'items',
                                        total: 'total',
                                        page: 'page',
                                        hasNextPage: 'hasNextPage'
                                    }
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const libraries = await api.listLibraries({ brandId: 'brandId' });
                    expect(libraries).toEqual({
                        items: 'items',
                        total: 'total',
                        page: 'page',
                        hasNextPage: 'hasNextPage'
                    });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Retrieve information about libraries using pagination', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === buildQl(10, 30).replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                brand: {
                                    libraries: {
                                        items: 'items',
                                        total: 'total',
                                        page: 'page',
                                        hasNextPage: 'hasNextPage'
                                    }
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const libraries = await api.listLibraries({
                        brandId: 'brandId',
                        page: 10,
                        limit: 30
                    });
                    expect(libraries).toEqual({
                        items: 'items',
                        total: 'total',
                        page: 'page',
                        hasNextPage: 'hasNextPage'
                    });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get error coming from libraries endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === buildQl().replace(/\s/g, ''))
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

        describe('#listCollections', () => {
            const ql = `query Collections {
                           library(id: "libraryId") {
                             collections {
                               items {
                                 id
                                 name
                                 __typename
                               }
                             }
                           }
                         }`;

            describe('Retrieve information about collections', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                library: {
                                    collections: {
                                        items: [{
                                            id: 'id',
                                            name: 'Test collection',
                                            __typename: 'Collection'
                                        }]
                                    }
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const collections = await api.listCollections({ libraryId: 'libraryId' });
                    expect(collections.items).toEqual([{ id: 'id', name: 'Test collection', __typename: 'Collection' }]);
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get error coming from collections endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            errors: [
                                {
                                    message: 'An error getting collections happened!',
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
                        async () => await api.listCollections({ libraryId: 'libraryId' })
                    ).rejects.toThrow(new Error('An error getting collections happened!'));
                });
            });
        });

        describe('#listProjectAssets', () => {
            const buildQl = (page, limit) => `
                              query ProjectAssets {
                                workspaceProject(id: "projectId") {
                                  assets(page: ${page || 1}, limit: ${limit || 25}) {
                                    items {
                                      id
                                      title
                                      description
                                      tags {
                                        source
                                        value
                                      }
                                      __typename
                                      ${api._filesQuery()}
                                    }
                                    total
                                    page
                                    hasNextPage
                                  }
                                }
                              }`;

            describe('Retrieve information about a project\'s assets', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === buildQl().replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                workspaceProject: {
                                    assets: {
                                        items: 'items',
                                        total: 'total',
                                        page: 'page',
                                        hasNextPage: 'hasNextPage'
                                    }
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const projectAssets = await api.listProjectAssets({ projectId: 'projectId' });
                    expect(projectAssets).toEqual({
                        items: 'items',
                        total: 'total',
                        page: 'page',
                        hasNextPage: 'hasNextPage'
                    });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Retrieve information about a project\'s assets using pagination', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === buildQl(5, 15).replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                workspaceProject: {
                                    assets: {
                                        items: 'items',
                                        total: 'total',
                                        page: 'page',
                                        hasNextPage: 'hasNextPage'
                                    }
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const projectAssets = await api.listProjectAssets({
                        projectId: 'projectId',
                        page: 5,
                        limit: 15
                    });
                    expect(projectAssets).toEqual({
                        items: 'items',
                        total: 'total',
                        page: 'page',
                        hasNextPage: 'hasNextPage'
                    });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get error coming from a project\'s assets endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === buildQl().replace(/\s/g, ''))
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
            const buildQl = (page, limit) => `
                              query ProjectFolders {
                                workspaceProject(id: "projectId") {
                                  browse {
                                    folders(page: ${page || 1}, limit: ${limit || 25}) {
                                      items {
                                        id
                                        name
                                        __typename
                                      }
                                      total
                                      page
                                      hasNextPage
                                    }
                                  }
                                }
                              }`;

            describe('Retrieve information about a project\'s folders', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === buildQl().replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                workspaceProject: {
                                    browse: {
                                        folders: {
                                            items: 'items',
                                            total: 'total',
                                            page: 'page',
                                            hasNextPage: 'hasNextPage'
                                        }
                                    }
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const projectFolders = await api.listProjectFolders({ projectId: 'projectId' });
                    expect(projectFolders).toEqual({
                        items: 'items',
                        total: 'total',
                        page: 'page',
                        hasNextPage: 'hasNextPage'
                    });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Retrieve information about a project\'s folders using pagination', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === buildQl(2, 8).replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                workspaceProject: {
                                    browse: {
                                        folders: {
                                            items: 'items',
                                            total: 'total',
                                            page: 'page',
                                            hasNextPage: 'hasNextPage'
                                        }
                                    }
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const projectFolders = await api.listProjectFolders({
                        projectId: 'projectId',
                        page: 2,
                        limit: 8
                    });
                    expect(projectFolders).toEqual({
                        items: 'items',
                        total: 'total',
                        page: 'page',
                        hasNextPage: 'hasNextPage'
                    });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get error coming from a project\'s folders endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === buildQl().replace(/\s/g, ''))
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
            const buildQl = (page, limit) => `
                              query LibraryAssets {
                                library(id: "libraryId") {
                                  assets(page: ${page || 1}, limit: ${limit || 25}) {
                                    items {
                                      id
                                      title
                                      description
                                      tags {
                                        source
                                        value
                                      }
                                      __typename
                                      ${api._filesQuery()}
                                    }
                                    total
                                    page
                                    hasNextPage
                                  }
                                }
                              }`;

            describe('Retrieve information about a library\'s assets', () => {
                let scope;

                beforeEach(() => {

                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === buildQl().replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                library: {
                                    assets: {
                                        items: 'items',
                                        total: 'total',
                                        page: 'page',
                                        hasNextPage: 'hasNextPage'
                                    }
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const libraryAssets = await api.listLibraryAssets({ libraryId: 'libraryId' });
                    expect(libraryAssets).toEqual({
                        items: 'items',
                        total: 'total',
                        page: 'page',
                        hasNextPage: 'hasNextPage'
                    });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Retrieve information about a library\'s assets using pagination', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === buildQl(20, 100).replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                library: {
                                    assets: {
                                        items: 'items',
                                        total: 'total',
                                        page: 'page',
                                        hasNextPage: 'hasNextPage'
                                    }
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const libraryAssets = await api.listLibraryAssets({
                        libraryId: 'libraryId',
                        page: 20,
                        limit: 100
                    });
                    expect(libraryAssets).toEqual({
                        items: 'items',
                        total: 'total',
                        page: 'page',
                        hasNextPage: 'hasNextPage'
                    });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get error coming from a library\'s assets endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === buildQl().replace(/\s/g, ''))
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
            const buildQl = (page, limit) => `
                              query LibraryFolders {
                                library(id: "libraryId") {
                                  browse {
                                    folders(page: ${page || 1}, limit: ${limit || 25}) {
                                      items {
                                        id
                                        name
                                        createdAt
                                        modifiedAt
                                        __typename
                                      }
                                      total
                                      page
                                      hasNextPage
                                    }
                                  }
                                }
                              }`;

            describe('Retrieve information about a library\'s folders', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === buildQl().replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                library: {
                                    browse: {
                                        folders: {
                                            items: 'items',
                                            total: 'total',
                                            page: 'page',
                                            hasNextPage: 'hasNextPage'
                                        }
                                    }
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const libraryFolders = await api.listLibraryFolders({ libraryId: 'libraryId' });
                    expect(libraryFolders).toEqual({
                        items: 'items',
                        total: 'total',
                        page: 'page',
                        hasNextPage: 'hasNextPage'
                    });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Retrieve information about a library\'s folders using pagination', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === buildQl(15, 25).replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                library: {
                                    browse: {
                                        folders: {
                                            items: 'items',
                                            total: 'total',
                                            page: 'page',
                                            hasNextPage: 'hasNextPage'
                                        }
                                    }
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const libraryFolders = await api.listLibraryFolders({
                        libraryId: 'libraryId',
                        page: 15,
                        limit: 25
                    });
                    expect(libraryFolders).toEqual({
                        items: 'items',
                        total: 'total',
                        page: 'page',
                        hasNextPage: 'hasNextPage'
                    });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get error coming from a library\'s folders endpoint', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === buildQl().replace(/\s/g, ''))
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
            const buildQl = (page, limit) => `
                              query BrandLevelSearch {
                                brand(id: "brandId") {
                                  id
                                  name
                                  search(page: ${page || 1}, limit: ${limit || 25}, query: {term: "term"}) {
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
                                        ${api._filesQuery()}
                                      }
                                    }
                                    total
                                    page
                                    hasNextPage
                                  }
                                }
                              }`;

            describe('Retrieve information when searching in Brand', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === buildQl().replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                brand: {
                                    id: "eyJpZGVudGlmaWVyIjoxLCJ0eXBlIjoiYnJhbmQifQ==",
                                    name: "Left Hook",
                                    search: {
                                        edges: 'edges',
                                        total: 'total',
                                        page: 'page',
                                        hasNextPage: 'hasNextPage'
                                    }
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const query = {
                        brandId: 'brandId',
                        term: 'term'
                    };

                    const results = await api.searchInBrand(query);
                    expect(results).toEqual({
                        items: 'edges',
                        total: 'total',
                        page: 'page',
                        hasNextPage: 'hasNextPage'
                    });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Retrieve information when searching in Brand using pagination', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === buildQl(5, 30).replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                brand: {
                                    id: "eyJpZGVudGlmaWVyIjoxLCJ0eXBlIjoiYnJhbmQifQ==",
                                    name: "Left Hook",
                                    search: {
                                        edges: 'edges',
                                        total: 'total',
                                        page: 'page',
                                        hasNextPage: 'hasNextPage'
                                    }
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const query = {
                        brandId: 'brandId',
                        term: 'term',
                        page: 5,
                        limit: 30
                    };

                    const results = await api.searchInBrand(query);
                    expect(results).toEqual({
                        items: 'edges',
                        total: 'total',
                        page: 'page',
                        hasNextPage: 'hasNextPage'
                    });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get incoming error when searching', () => {

                beforeEach(() => {
                    nock(baseUrl)
                        .post('', (body ) => body.query.replace(/\s/g, '') === buildQl().replace(/\s/g, ''))
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
                        term: 'term'
                    };

                    expect(
                        async () => await api.searchInBrand(query)
                    ).rejects.toThrow(new Error('An error searching brand happened!'));
                });
            });
        });

        describe('#createAsset', () => {
            const ql = `mutation CreateAsset {
                          createAsset(input: {
                            fileId: "fileId",
                            title: "title",
                            parentId: "projectId"
                          }) {
                            job {
                              assetId
                            }
                          }
                        }`;

            describe('Create a new asset', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                createAsset: {
                                    job: {
                                        assetId: 'assetId'
                                    }
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const asset = {
                        id: 'fileId',
                        title: 'title',
                        projectId: 'projectId'
                    };

                    const results = await api.createAsset(asset);
                    expect(results).toEqual({ id: 'assetId' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });

        describe('#createFileId', () => {
            const ql = `mutation UploadFile {
                        uploadFile(input: {
                          filename: "filename",
                          size: size,
                          chunkSize: chunkSize
                        }) {
                          id
                          urls
                        }
                      }`;

            describe('Create a file ID', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                        .reply(200, {
                            data: {
                                uploadFile: {
                                    uploadFile: 'uploadFile'
                                }
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const input = {
                        filename: 'filename',
                        size: 'size',
                        chunkSize: 'chunkSize'
                    };

                    const results = await api.createFileId(input);
                    expect(results).toEqual({ uploadFile: 'uploadFile' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });

        describe('#uploadFile', () => {
            describe('Create a file ID', () => {
                let scopeOne, scopeTwo;

                beforeEach(() => {
                    scopeOne = nock('https://foo')
                        .put('/bar', 'foo,bar')
                        .reply(200, {
                            data: {
                                uploadFile: {
                                    uploadFile: 'uploadFile'
                                }
                            }
                        });

                    scopeTwo = nock('https://bar')
                        .put('/foo', 'bar')
                        .reply(200, {
                            data: {
                                uploadFile: {
                                    uploadFile: 'uploadFile'
                                }
                            }
                        });
                });

                it('should fetch files from correct endpoints', async () => {
                    const input = {
                        stream: ['foo', 'bar'],
                        urls: ['https://foo/bar', 'https://bar/foo'],
                        chunkSize: 'chunkSize'
                    };

                    await api.uploadFile(input.stream, input.urls);
                    expect(scopeOne.isDone()).toBe(true);
                    // expect(scopeTwo.isDone()).toBe(true);
                });
            });
        });

        describe('#getSubFolderContent', () => {
            const buildQlFolders = (page, limit) => `
                                     query FolderById {
                                       node(id: "subFolderId") {
                                         ... on Folder {
                                           name
                                           folders(page: ${page || 1}, limit: ${limit || 25}) {
                                             items {
                                               id
                                               name
                                               __typename
                                             }
                                             total
                                             page
                                             hasNextPage
                                           }
                                         }
                                       }
                                     }`;

            const buildQlAssets = (page, limit) => `
                                    query FolderById {
                                      node(id: "subFolderId") {
                                        ... on Folder {
                                          name
                                          assets(page: ${page || 1}, limit: ${limit || 25}) {
                                            items {
                                              id
                                              title
                                              tags {
                                                source
                                                value
                                              }
                                              __typename
                                              ${api._filesQuery()}
                                            }
                                            total
                                            page
                                            hasNextPage
                                          }
                                        }
                                      }
                                    }`;

            describe('Get subfolder assets', () => {
                let scope;
                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === buildQlAssets().replace(/\s/g, ''))
                        .reply(200, {
                            "data": {
                                "node": {
                                    "name": "Libfolder",
                                    "assets": {
                                        "items": [
                                            {
                                                "id": "eyJpZGVudGlmaWVyIjoxOSwidHlwZSI6ImFzc2V0In0=",
                                                "title": "FriggbyLeftHookLogoJuly2022",
                                                "__typename": "Image",
                                                "previewUrl": "https://cdn-assets-us.frontify.com/s3/frontify-enterprise-files-us/eyJvYXV0aCI6eyJjbGllbnRfaWQiOiJmcm9udGlmeS1leHBsb3JlciJ9LCJwYXRoIjoibGVmdC1ob29rXC9maWxlXC9yNXpkZDQ5djJFaFg4QjZMbW1Rdi5zdmcifQ:left-hook:2ecHvM3WRlNvkinOWJXvxhYK0QBHNwaSiyioQ3ORC_s",
                                                "width": 400,
                                                "height": 202
                                            },
                                            {
                                                "id": "eyJpZGVudGlmaWVyIjoxOCwidHlwZSI6ImFzc2V0In0=",
                                                "title": "custom_avatar-1661205632",
                                                "__typename": "Image",
                                                "previewUrl": "https://cdn-assets-us.frontify.com/s3/frontify-enterprise-files-us/eyJvYXV0aCI6eyJjbGllbnRfaWQiOiJmcm9udGlmeS1leHBsb3JlciJ9LCJwYXRoIjoibGVmdC1ob29rXC9maWxlXC95ZFR1TDlwVnJUUks2d0tvUlROYS5wbmcifQ:left-hook:PMD4S_9gflsrMNEBDNHxwxQqHlgHaCjrZFiGML8AHU0",
                                                "width": 128,
                                                "height": 128
                                            }
                                        ],
                                        total: 'total',
                                        page: 'page',
                                        hasNextPage: 'hasNextPage'
                                    }
                                }
                            },
                            "extensions": {
                                "complexityScore": 0
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const query = {
                        subFolderId: 'subFolderId',
                        term: 'term'
                    };

                    const results = await api.listSubFolderAssets(query);
                    expect(results).toHaveProperty('items');
                    expect(results.items).toHaveLength(2);
                    expect(results.total).toEqual('total');
                    expect(results.page).toEqual('page');
                    expect(results.hasNextPage).toEqual('hasNextPage');
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get subfolder assets using pagination', () => {
                let scope;
                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === buildQlAssets(2, 4).replace(/\s/g, ''))
                        .reply(200, {
                            "data": {
                                "node": {
                                    "name": "Libfolder",
                                    "assets": {
                                        "items": [
                                            {
                                                "id": "eyJpZGVudGlmaWVyIjoxOSwidHlwZSI6ImFzc2V0In0=",
                                                "title": "FriggbyLeftHookLogoJuly2022",
                                                "__typename": "Image",
                                                "previewUrl": "https://cdn-assets-us.frontify.com/s3/frontify-enterprise-files-us/eyJvYXV0aCI6eyJjbGllbnRfaWQiOiJmcm9udGlmeS1leHBsb3JlciJ9LCJwYXRoIjoibGVmdC1ob29rXC9maWxlXC9yNXpkZDQ5djJFaFg4QjZMbW1Rdi5zdmcifQ:left-hook:2ecHvM3WRlNvkinOWJXvxhYK0QBHNwaSiyioQ3ORC_s",
                                                "width": 400,
                                                "height": 202
                                            },
                                            {
                                                "id": "eyJpZGVudGlmaWVyIjoxOCwidHlwZSI6ImFzc2V0In0=",
                                                "title": "custom_avatar-1661205632",
                                                "__typename": "Image",
                                                "previewUrl": "https://cdn-assets-us.frontify.com/s3/frontify-enterprise-files-us/eyJvYXV0aCI6eyJjbGllbnRfaWQiOiJmcm9udGlmeS1leHBsb3JlciJ9LCJwYXRoIjoibGVmdC1ob29rXC9maWxlXC95ZFR1TDlwVnJUUks2d0tvUlROYS5wbmcifQ:left-hook:PMD4S_9gflsrMNEBDNHxwxQqHlgHaCjrZFiGML8AHU0",
                                                "width": 128,
                                                "height": 128
                                            }
                                        ],
                                        total: 'total',
                                        page: 'page',
                                        hasNextPage: 'hasNextPage'
                                    }
                                }
                            },
                            "extensions": {
                                "complexityScore": 0
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const query = {
                        subFolderId: 'subFolderId',
                        term: 'term',
                        page: 2,
                        limit: 4
                    };

                    const results = await api.listSubFolderAssets(query);
                    expect(results).toHaveProperty('items');
                    expect(results.items).toHaveLength(2);
                    expect(results.total).toEqual('total');
                    expect(results.page).toEqual('page');
                    expect(results.hasNextPage).toEqual('hasNextPage');
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get subfolder folders', () => {
                let scope;
                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === buildQlFolders().replace(/\s/g, ''))
                        .reply(200, {
                            "data": {
                                "node": {
                                    "name": "Libfolder",
                                    "folders": {
                                        "items": [
                                            {
                                                "id": "folderId",
                                                "name": "FolderName",
                                                "__typename": "SubFolder"
                                            },
                                            {
                                                "id": "folderId2",
                                                "name": "FolderName2",
                                                "__typename": "SubFolder"
                                            }
                                        ],
                                        total: 'total',
                                        page: 'page',
                                        hasNextPage: 'hasNextPage'
                                    }
                                }
                            },
                            "extensions": {
                                "complexityScore": 0
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const query = {
                        subFolderId: 'subFolderId',
                        term: 'term'
                    };

                    const results = await api.listSubFolderFolders(query);
                    expect(results).toHaveProperty('items');
                    expect(results.items).toHaveLength(2);
                    expect(results.total).toEqual('total');
                    expect(results.page).toEqual('page');
                    expect(results.hasNextPage).toEqual('hasNextPage');
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Get subfolder folders using pagination', () => {
                let scope;
                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('', (body) => body.query.replace(/\s/g, '') === buildQlFolders(3, 6).replace(/\s/g, ''))
                        .reply(200, {
                            "data": {
                                "node": {
                                    "name": "Libfolder",
                                    "folders": {
                                        "items": [
                                            {
                                                "id": "folderId",
                                                "name": "FolderName",
                                                "__typename": "SubFolder"
                                            },
                                            {
                                                "id": "folderId2",
                                                "name": "FolderName2",
                                                "__typename": "SubFolder"
                                            }
                                        ],
                                        total: 'total',
                                        page: 'page',
                                        hasNextPage: 'hasNextPage'
                                    }
                                }
                            },
                            "extensions": {
                                "complexityScore": 0
                            }
                        });
                });

                it('should return the correct response', async () => {
                    const query = {
                        subFolderId: 'subFolderId',
                        term: 'term',
                        page: 3,
                        limit: 6
                    };

                    const results = await api.listSubFolderFolders(query);
                    expect(results).toHaveProperty('items');
                    expect(results.items).toHaveLength(2);
                    expect(results.total).toEqual('total');
                    expect(results.page).toEqual('page');
                    expect(results.hasNextPage).toEqual('hasNextPage');
                    expect(scope.isDone()).toBe(true);
                });
            });
        });

        describe('#getQueryResponse', () => {
            const ql = `query LibraryById {
                  library: node(id: "libId") {
                    type: __typename
                    ... on Library {
                      id
                      name
                    }
                  }
                }`;
            let scope;
            beforeEach(() => {
                scope = nock(baseUrl)
                    .post('', (body) => body.query.replace(/\s/g, '') === ql.replace(/\s/g, ''))
                    .reply(200, {
                        "data": {
                            "library": {
                                "type": "Brand"
                            }
                        },
                        "extensions": {
                            "complexityScore": 0
                        }
                    });
            });

            it('should return the correct response', async () => {
                const results = await api.getResponseUsingQuery(ql);
                expect(results).toHaveProperty('data');
                expect(results.data).toEqual({ "library": { "type": "Brand" } });
                expect(scope.isDone()).toBe(true);
            });
        });
    });
});
