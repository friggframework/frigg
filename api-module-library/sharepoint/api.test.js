const Authenticator = require('@friggframework/test-environment/Authenticator');
const { Api } = require('./api');
const config = require('./defaultConfig.json');
const nock = require('nock');

describe(`${config.label} API Tests`, () => {
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

        describe('#retrieveFolder', () => {
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

                    const folder = await api.retrieveFolder(params);
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

                    const folder = await api.retrieveFolder(params);
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
        });

        describe('#retrieveFile', () => {
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

                    const file = await api.retrieveFile(params);
                    expect(file).toEqual({ file: 'file' });
                    expect(scope.isDone()).toBe(true);
                });
            });
        });
    });
});
