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
            uploadFile: ({ driveId, childId, filename }) =>
                `/drives/${driveId}/items/${childId}:/${filename}:/content`,
            createUploadSession: ({ driveId, childId, filename }) =>
                `/drives/${driveId}/${childId}:/${filename}:/createUploadSession`
        };

        this.authorizationUri = `https://login.microsoftonline.com/${this.tenant_id}/oauth2/v2.0/authorize`;
        this.tokenUri = `https://login.microsoftonline.com/${this.tenant_id}/oauth2/v2.0/token`;
    }

    buildParams(query) {
        return {
            driveId: query.driveId,
            childId: query.folderId ? query.folderId : 'root',
        };
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
        return response;
    }

    async listDrives(query) {
        const options = {
            url: `${this.baseUrl}${this.URLs.drivesBySite(query.siteId)}`,
        };
        const response = await this._get(options);
        return response;
    }

    async getFolder(query) {
        const params = this.buildParams(query);

        const options = {
            url: `${this.baseUrl}${this.URLs.rootFolders(params)}`,
        };

        if (query.nextPageUrl) {
            options.url = query.nextPageUrl;
        }

        const response = await this._get(options);
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
        return response;
    }

    async graphSearchQuery(query) {
        const organizationId = query.organizationId;
        const fileExtension = query.filter?.fileTypes;

        let formattedTypes = '';
        if (fileExtension) formattedTypes = fileExtension.map(type => `filetype:${type}`).join(' OR ');

        const options = {
            url: `${this.baseUrl}/search/query`,
            headers: {
                'Content-Type': 'application/json',
            },
            body: {
                "requests": [
                    {
                        "entityTypes": [
                            "driveItem"
                        ],
                        "query": {
                            "queryString": `${query.query} driveId:${organizationId} ${formattedTypes}`
                        },
                        "from": `${query.nextPage || 0}`,
                        "size": `${query.limit || 25}`
                    }
                ]
            },
        };
        return await this._post(options);
    }

    async getFile(query) {
        const params = {
            driveId: query.driveId,
            fileId: query.fileId,
        };

        const options = {
            url: `${this.baseUrl}${this.URLs.getFile(params)}`,
        };

        const response = await this._get(options);
        return response;
    }

    // Upload small files in one go
    async uploadFile(query, filename, buffer) {
        const params = this.buildParams(query);
        params.filename = filename;

        const options = {
            url: `${this.baseUrl}${this.URLs.uploadFile(params)}`,
            headers: {
                'Content-Type': 'binary',
            },
            body: buffer,
        };

        return this._put(options, false);
    }

    // Returns link to which a file can uploaded
    // in chunks
    async createUploadSession(query, filename) {
        const params = this.buildParams(query);
        params.filename = filename;

        const options = {
            url: `${this.baseUrl}${this.URLs.createUploadSession(params)}`,
            headers: {
                'Content-Type': 'application/json',
            },
            body: {
                item: {
                    name: filename
                }
            },
        };

        return this._post(options);
    }

    // Upload large file in chunks
    async uploadFileWithSession(url, size, stream) {
        const responses = [];
        let current = 0;

        for await (const chunk of stream) {
            const chunkSize = chunk.length - 1;
            const options = {
                headers: {
                    'Content-Length': chunkSize,
                    'Content-Range': `bytes ${current}-${current + chunkSize}/${size}`
                },
                body: chunk,
                url
            };

            const resp = await this._put(options, false);
            responses.push(resp);

            current += chunkSize + 1;
        }

        return responses;
    }
}

module.exports = { Api };
