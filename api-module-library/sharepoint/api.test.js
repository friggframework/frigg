const Authenticator = require('@friggframework/test-environment/Authenticator');
const { Api } = require('./api');
const config = require('./defaultConfig.json');
const chai = require('chai');
const expect = chai.expect;

describe(`${config.label} API Tests`, () => {
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
                expect(api.backOff).to.eql([1, 3]);
                expect(api.baseUrl).to.equal('https://graph.microsoft.com/v1.0');
                expect(api.tenant_id).to.equal('tenant_id');
                expect(api.state).to.equal('state');
                expect(api.forceConsent).to.equal('forceConsent');
                expect(api.URLs.userDetails).to.equal('/me');
                expect(api.URLs.orgDetails).to.equal('/organization');
                expect(api.URLs.defaultSite).to.equal('/sites/root');
                expect(api.URLs.allSites).to.equal('/sites?search=*');
                expect(api.URLs.defaultDrives).to.equal('/sites/root/drives');
                expect(api.URLs.drivesBySite('siteId')).to.equal('/sites/siteId/drives');
                expect(api.URLs.rootFolders({
                    driveId: 'driveId',
                    childId: 'childId'
                })).to.equal('/drives/driveId/items/childId/children?$expand=thumbnails&top=8&$filter=');
                expect(api.URLs.folderChildren('childId')).to.equal('/me/drive/items/childId/children?$filter=');
                expect(api.URLs.getFile({
                    driveId: 'driveId',
                    fileId: 'fileId'
                })).to.equal('/drives/driveId/items/fileId?$expand=listItem');
                expect(api.URLs.search({
                    driveId: 'driveId',
                    query: 'query'
                })).to.equal("/drives/driveId/root/search(q='query')?top=20&$select=id,image,name,file,parentReference,size,lastModifiedDateTime,@microsoft.graph.downloadUrl&$filter=");
            });
        });

        describe('Create new API without params', () => {
            let api;

            beforeEach(() => {
                api = new Api();
            });

            it('should have all properties filled', () => {
                expect(api.backOff).to.eql([1, 3]);
                expect(api.baseUrl).to.equal('https://graph.microsoft.com/v1.0');
                expect(api.tenant_id).to.equal('common');
                expect(api.state).to.be.null;
                expect(api.forceConsent).to.be.true;
                expect(api.URLs.userDetails).to.equal('/me');
                expect(api.URLs.orgDetails).to.equal('/organization');
                expect(api.URLs.defaultSite).to.equal('/sites/root');
                expect(api.URLs.allSites).to.equal('/sites?search=*');
                expect(api.URLs.defaultDrives).to.equal('/sites/root/drives');
                expect(api.URLs.drivesBySite('siteId')).to.equal('/sites/siteId/drives');
                expect(api.URLs.rootFolders({
                    driveId: 'driveId',
                    childId: 'childId'
                })).to.equal('/drives/driveId/items/childId/children?$expand=thumbnails&top=8&$filter=');
                expect(api.URLs.folderChildren('childId')).to.equal('/me/drive/items/childId/children?$filter=');
                expect(api.URLs.getFile({
                    driveId: 'driveId',
                    fileId: 'fileId'
                })).to.equal('/drives/driveId/items/fileId?$expand=listItem');
                expect(api.URLs.search({
                    driveId: 'driveId',
                    query: 'query'
                })).to.equal("/drives/driveId/root/search(q='query')?top=20&$select=id,image,name,file,parentReference,size,lastModifiedDateTime,@microsoft.graph.downloadUrl&$filter=");
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
                expect(api.getAuthUri()).to.equal(link);
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
                expect(api.getAuthUri()).to.equal(link);
            });
        });
    });
});
