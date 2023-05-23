const { get } = require('@friggframework/assertions');
const { OAuth2Requester } = require('@friggframework/module-plugin');
const querystring = require('querystring');
const probe = require('probe-image-size');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.backOff = [1, 3];
        this.baseUrl = 'https://graph.microsoft.com/v1.0';
        // Parent class already expects
        // client_id, client_secret, redirect_uri, scope to be passed in
        // Storing and passing in the above should be the responsibility of the
        // caller/developer importing this/any api class.

        // Setting to 'common'  by default since that's the most likely tenant we'll want/need
        this.tenant_id = get(params, 'tenant_id', 'common');
        this.state = get(params, 'state', null);
        this.forceConsent = get(params, 'forceConsent', true);

        this.URLs = {
            userDetails: '/me',
            orgDetails: `/organization`,
            defaultSite: '/sites/root',
            allSites: `/sites?search=*`,
            defaultDrives: '/sites/root/drives',
            drivesBySite: (siteId) => `/sites/${siteId}/drives`,
            rootFolders: ({ driveId, childId }) =>
                `/drives/${driveId}/items/${childId}/children?$expand=thumbnails&top=8&$filter=`,
            folderChildren: (childId) =>
                `/me/drive/items/${childId}/children?$filter=`,
            getFile: ({ driveId, fileId }) =>
                `/drives/${driveId}/items/${fileId}?$expand=listItem`,
            search: ({ driveId, query }) =>
                `/drives/${driveId}/root/search(q='${query}')?top=20&$select=id,image,name,file,parentReference,size,lastModifiedDateTime,@microsoft.graph.downloadUrl&$filter=`,
        };

        this.authorizationUri = `https://login.microsoftonline.com/${this.tenant_id}/oauth2/v2.0/authorize`;
        this.tokenUri = `https://login.microsoftonline.com/${this.tenant_id}/oauth2/v2.0/token`;
    }

    getAuthUri() {
        const query = {
            client_id: this.client_id,
            response_type: 'code',
            redirect_uri: this.redirect_uri,
            scope: this.scope,
            state: this.state,
        };
        if (this.forceConsent) query.prompt = 'select_account';

        return `${this.authorizationUri}?${querystring.stringify(query)}`;
    }

    async getUser() {
        const options = {
            url: `${this.baseUrl}${this.URLs.userDetails}`,
        };
        const response = await this._get(options);
        return response;
    }
    async getOrganization() {
        const options = {
            url: `${this.baseUrl}${this.URLs.orgDetails}`,
        };
        const response = await this._get(options);
        return response.value[0];
    }

    async listSites() {
        const options = {
            url: `${this.baseUrl}${this.URLs.allSites}`,
        };
        const response = await this._get(options);
        console.log(response);
        return response;
    }

    async listDrives(query) {
        const options = {
            url: `${this.baseUrl}${this.URLs.drivesBySite(query.siteId)}`,
        };
        const response = await this._get(options);
        console.log(response);
        return response;
    }

    async retrieveFolder(query) {
        const params = {
            driveId: query.driveId,
            childId: query.folderId ? query.folderId : 'root',
        };

        const options = {
            url: `${this.baseUrl}${this.URLs.rootFolders(params)}`,
        };

        if (query.nextPageUrl) {
            options.url = query.nextPageUrl;
        }

        const response = await this._get(options);
        console.log(response);
        return response;
    }

    async search(query) {
        const params = {
            driveId: query.driveId,
            query: query.q,
        };

        const options = {
            url: `${this.baseUrl}${this.URLs.search(params)}`,
        };

        if (query.nextPageUrl) {
            options.url = query.nextPageUrl;
        }

        const response = await this._get(options);
        console.log(response);
        return response;
    }

    async retrieveFile(query) {
        const params = {
            driveId: query.driveId,
            fileId: query.fileId,
        };

        const options = {
            url: `${this.baseUrl}${this.URLs.getFile(params)}`,
        };

        const response = await this._get(options);
        console.log(response);
        return response;
    }
}

module.exports = { Api };
