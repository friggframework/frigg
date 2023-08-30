const Authenticator = require('@friggframework/test-environment/Authenticator');
const { Api } = require('./api');
const Config = require('./defaultConfig');
const nock = require('nock');

describe(`${Config.label} API Tests`, () => {
    const baseUrl = 'https://graph.microsoft.com/v1.0';

    describe('#constructor', () => {
        describe('Create new API with params', () => {
            let api;

            beforeEach(() => {
                const params = {
                    tenant_id: 'tenant_id',
                    state: 'state',
                    forceConsent: 'forceConsent',
                };

                api = new Api(params);
            });

            it('should have all properties filled', () => {
                expect(api.backOff).toEqual([1, 3]);
                expect(api.baseUrl).toEqual(baseUrl);
                expect(api.tenant_id).toEqual('tenant_id');
                expect(api.state).toEqual('state');
                expect(api.forceConsent).toEqual('forceConsent');
                expect(api.URLs.userDetails).toEqual('/me');
                expect(api.URLs.orgDetails).toEqual('/organization');
                expect(api.URLs.defaultSite).toEqual('/sites/root');
                expect(api.URLs.allSites).toEqual('/sites?search=*');
                expect(api.URLs.defaultDrives).toEqual('/sites/root/drives');
                expect(api.URLs.drivesBySite('siteId')).toEqual('/sites/siteId/drives');
                expect(api.URLs.rootFolders({
                    driveId: 'driveId',
                    childId: 'childId'
                })).toEqual('/drives/driveId/items/childId/children?$expand=thumbnails&top=8&$filter=');
                expect(api.URLs.folderChildren('childId')).toEqual('/me/drive/items/childId/children?$filter=');
                expect(api.URLs.getFile({
                    driveId: 'driveId',
                    fileId: 'fileId'
                })).toEqual('/drives/driveId/items/fileId?$expand=listItem');
                expect(api.URLs.search({
                    driveId: 'driveId',
                    query: 'query'
                })).toEqual("/drives/driveId/root/search(q='query')?top=20&$select=id,image,name,file,parentReference,size,lastModifiedDateTime,@microsoft.graph.downloadUrl&$filter=");
                expect(api.URLs.uploadFile({
                    driveId: 'driveId',
                    childId: 'childId',
                    filename: 'filename'
                })).toEqual('/drives/driveId/items/childId:/filename:/content');
                expect(api.URLs.createUploadSession({
                    driveId: 'driveId',
                    childId: 'childId',
                    filename: 'filename'
                })).toEqual('/drives/driveId/childId:/filename:/createUploadSession');
                expect(api.authorizationUri).toEqual('https://login.microsoftonline.com/tenant_id/oauth2/v2.0/authorize');
                expect(api.tokenUri).toEqual('https://login.microsoftonline.com/tenant_id/oauth2/v2.0/token');
            });
        });

        describe('Create new API without params', () => {
            let api;

            beforeEach(() => {
                api = new Api();
            });

            it('should have all properties filled', () => {
                expect(api.backOff).toEqual([1, 3]);
                expect(api.baseUrl).toEqual(baseUrl);
                expect(api.tenant_id).toEqual('common');
                expect(api.state).toBeNull();
                expect(api.forceConsent).toBe(true);
                expect(api.URLs.userDetails).toEqual('/me');
                expect(api.URLs.orgDetails).toEqual('/organization');
                expect(api.URLs.defaultSite).toEqual('/sites/root');
                expect(api.URLs.allSites).toEqual('/sites?search=*');
                expect(api.URLs.defaultDrives).toEqual('/sites/root/drives');
                expect(api.URLs.drivesBySite('siteId')).toEqual('/sites/siteId/drives');
                expect(api.URLs.rootFolders({
                    driveId: 'driveId',
                    childId: 'childId'
                })).toEqual('/drives/driveId/items/childId/children?$expand=thumbnails&top=8&$filter=');
                expect(api.URLs.folderChildren('childId')).toEqual('/me/drive/items/childId/children?$filter=');
                expect(api.URLs.getFile({
                    driveId: 'driveId',
                    fileId: 'fileId'
                })).toEqual('/drives/driveId/items/fileId?$expand=listItem');
                expect(api.URLs.search({
                    driveId: 'driveId',
                    query: 'query'
                })).toEqual("/drives/driveId/root/search(q='query')?top=20&$select=id,image,name,file,parentReference,size,lastModifiedDateTime,@microsoft.graph.downloadUrl&$filter=");
                expect(api.authorizationUri).toEqual('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
                expect(api.tokenUri).toEqual('https://login.microsoftonline.com/common/oauth2/v2.0/token');
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

    describe('#buildParams', () => {
        describe('Folder param missing', () => {
            it('should replace with root value', () => {
                const api = new Api({});
                expect(api.buildParams({
                    driveId: 'driveId'
                })).toEqual({
                    driveId: 'driveId',
                    childId: 'root'
                });
            });
        });

        describe('Folder param present', () => {
            it('should replace with root value', () => {
                const api = new Api({});
                expect(api.buildParams({
                    driveId: 'driveId',
                    folderId: 'folderId'
                })).toEqual({
                    driveId: 'driveId',
                    childId: 'folderId'
                });
            });
        });
    });

    describe('#getAuthUri', () => {
        describe('Generate Auth Url', () => {
            let api;

            beforeEach(() => {
                const apiParams = {
                    client_id: 'client_id',
                    client_secret: 'client_secret',
                    redirect_uri: 'redirect_uri',
                    scope: 'scope',
                    state: 'state',
                    forceConsent: true,
                };

                api = new Api(apiParams);
            });

            it('should return auth url', () => {
                const link = 'https://login.microsoftonline.com/'
                      + 'common/oauth2/v2.0/authorize?'
                      + 'client_id=client_id&response_type=code&redirect_uri=redirect_uri&scope=scope&state=state&prompt=select_account';
                expect(api.getAuthUri()).toEqual(link);
            });
        });

        describe('Generate Auth Url without prompt', () => {
            let api;

            beforeEach(() => {
                const apiParams = {
                    client_id: 'client_id',
                    client_secret: 'client_secret',
                    redirect_uri: 'redirect_uri',
                    scope: 'scope',
                    state: 'state',
                    forceConsent: false,
                };

                api = new Api(apiParams);
            });

            it('should return auth url', () => {
                const link = 'https://login.microsoftonline.com/'
                      + 'common/oauth2/v2.0/authorize?'
                      + 'client_id=client_id&response_type=code&redirect_uri=redirect_uri&scope=scope&state=state';
                expect(api.getAuthUri()).toEqual(link);
            });
        });
    });

    describe('HTTP Requests', () => {
        let api;

        beforeAll(() => {
            api = new Api();
        });

        afterEach(() => {
            nock.cleanAll();
        });

        describe('#getUser', () => {
            describe('Retrieve information about the user', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .get('/me')
                        .reply(200, {
                            me: 'me',
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const user = await api.getUser();
                    expect(user).toEqual({ me: 'me' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });

        describe('#getOrganization', () => {
            describe('Retrieve information about the organization', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .get('/organization')
                        .reply(200, {
                            value: [{
                                org: 'org'
                            }]
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const org = await api.getOrganization();
                    expect(org).toEqual({ org: 'org' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });

        describe('#listSites', () => {
            describe('Retrieve information about sites', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .get('/sites?search=*')
                        .reply(200, {
                            sites: 'sites'
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const sites = await api.listSites();
                    expect(sites).toEqual({ sites: 'sites' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });

        describe('#listDrives', () => {
            describe('Retrieve information about drives', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .get('/sites/siteId/drives')
                        .reply(200, {
                            drives: 'drives'
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const drives = await api.listDrives({ siteId: 'siteId' });
                    expect(drives).toEqual({ drives: 'drives' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });

        describe('#getFolder', () => {
            describe('Retrieve information about the root folder', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .get('/drives/driveId/items/root/children?$expand=thumbnails&top=8&$filter=')
                        .reply(200, {
                            folder: 'root'
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const params = {
                        driveId: 'driveId'            
                    };

                    const folder = await api.getFolder(params);
                    expect(folder).toEqual({ folder: 'root' });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Retrieve information about a folder', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .get('/drives/driveId/items/folderId/children?$expand=thumbnails&top=8&$filter=')
                        .reply(200, {
                            folder: 'folder'
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const params = {
                        driveId: 'driveId',
                        folderId: 'folderId'
                    };

                    const folder = await api.getFolder(params);
                    expect(folder).toEqual({ folder: 'folder' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });

        describe('#search', () => {
            describe('Perform a search', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .get('/drives/driveId/root/search(q=%27q%27)?top=20&$select=id,image,name,file,parentReference,size,lastModifiedDateTime,@microsoft.graph.downloadUrl&$filter=')
                        .reply(200, {
                            results: 'results'
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const params = {
                        driveId: 'driveId',
                        q: 'q'
                    };

                    const results = await api.search(params);
                    expect(results).toEqual({ results: 'results' });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Perform a search incluing nextPageUrl', () => {
                let scope;

                beforeEach(() => {
                    scope = nock('http://nextPageUrl')
                        .get('/')
                        .reply(200, {
                            results: 'results'
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const params = {
                        driveId: 'driveId',
                        q: 'q',
                        nextPageUrl: 'http://nextPageUrl/'
                    };

                    const results = await api.search(params);
                    expect(results).toEqual({ results: 'results' });
                    expect(scope.isDone()).toBe(true);
                });
            });

            describe('Perform a graphSearchQuery', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .post('/search/query')
                        .reply(200, {
                            results: 'results'
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const query = {
                        organizationId: 'driveId',
                        query: 'query',
                        filter: {
                            fileTypes: ['jpg']
                        }
                    };

                    const results = await api.graphSearchQuery(query);
                    expect(results).toEqual({ results: 'results' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });

        describe('#getFile', () => {
            describe('Retrieve information about drives', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl)
                        .get('/drives/driveId/items/fileId?$expand=listItem')
                        .reply(200, {
                            file: 'file'
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const params = {
                        driveId: 'driveId',
                        fileId: 'fileId'
                    };

                    const file = await api.getFile(params);
                    expect(file).toEqual({ file: 'file' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });

        describe('#uploadFile', () => {
            describe('Post buffer to endpoint', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl, {
                        reqheaders: {
                            'Content-Type': 'binary'
                        },
                    })
                        .put('/drives/driveId/items/childId:/filename:/content', 'buffer')
                        .reply(200, {
                            id: 'id'
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const params = {
                        driveId: 'driveId',
                        folderId: 'childId'
                    };

                    const result = await api.uploadFile(params, 'filename', 'buffer');
                    expect(result).toEqual({ id: 'id' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });

        describe('#createUploadSession', () => {
            describe('Create link for uploading files', () => {
                let scope;

                beforeEach(() => {
                    scope = nock(baseUrl, {
                        reqheaders: {
                            'Content-Type': 'application/json'
                        },
                    }).post('/drives/driveId/childId:/filename:/createUploadSession', {
                        item: {
                            name: 'filename'
                        }
                    }).reply(200, {
                        url: 'url'
                    });
                });

                it('should hit the correct endpoint', async () => {
                    const params = {
                        driveId: 'driveId',
                        folderId: 'childId'
                    };

                    const result = await api.createUploadSession(params, 'filename');
                    expect(result).toEqual({ url: 'url' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });

        describe('#uploadFileWithSession', () => {
            describe('Post stream chunks to endpoint', () => {
                let scopeOne, scopeTwo, scopeThree;

                beforeEach(() => {
                    scopeOne = nock('https://an_url', {
                        reqheaders: {
                            'Content-Length': 3,
                            'Content-Range': 'bytes 0-2/10'
                        },
                    })
                        .put('/', 'one')
                        .reply(200, {
                            any: 'one'
                        });

                    scopeTwo = nock('https://an_url', {
                        reqheaders: {
                            'Content-Length': 3,
                            'Content-Range': 'bytes 3-5/10'
                        },
                    })
                        .put('/', 'two')
                        .reply(200, {
                            any: 'two'
                        });

                    scopeThree = nock('https://an_url', {
                        reqheaders: {
                            'Content-Length': 5,
                            'Content-Range': 'bytes 6-10/10'
                        },
                    })
                        .put('/', 'three')
                        .reply(200, {
                            any: 'three'
                        });
                });

                it('should hit the correct endpoint', async () => {
                    const params = {
                        driveId: 'driveId',
                        folderId: 'childId'
                    };

                    const result = await api.uploadFileWithSession('https://an_url/', 10, ['one', 'two', 'three']);

                    expect(scopeOne.isDone()).toBe(true);
                    expect(scopeTwo.isDone()).toBe(true);
                    expect(scopeThree.isDone()).toBe(true);

                    expect(result).toEqual([{
                        any: 'one'
                    }, {
                        any: 'two'
                    }, {
                        any: 'three'
                    }]);

                });
            });
        });
    });
});
