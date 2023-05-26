const { OAuth2Requester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);

        this.baseUrl = 'https://www.googleapis.com/';

        this.URLs = {
            about: '/drive/v3/about',
            drives: '/drive/v3/drives',
            root: '/drive/v3/files/root',
            fileById: (fileId) => `/drive/v3/files/${fileId}`,
            fileLabels: (fileId) => `/drive/v3/files/${fileId}/listLabels`,
            files: '/drive/v3/files',
            fileUpload: '/upload/drive/v3/files',
            permissions: '/permissions',
        };

        this.tokenUri = 'https://oauth2.googleapis.com/token';

        /* eslint-disable camelcase */
        this.access_token = get(params, 'access_token', null);
        this.refresh_token = get(params, 'refresh_token', null);
        /* eslint-enable camelcase */
    }

    async getTokenFromCode(code) {
        return this.getTokenFromCodeBasicAuthHeader(code);
    }
    setState(state) {
        this.state = state;
    }
    getAuthorizationUri() {
        return encodeURI(
            `https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=${this.client_id}&redirect_uri=${this.redirect_uri}&scope=${this.scope}&access_type=offline&include_granted_scopes=true&state=${this.state}`
        );
    }

    async getAbout(fields = '*') {
        const options = {
            url: this.baseUrl + this.URLs.about,
            query: {
                fields,
            },
        };
        return this._get(options);
    }

    async getUserDetails() {
        const response = await this.getAbout('user');
        return response.user;
    }

    async getMyDriveRoot(query) {
        const options = {
            url: this.baseUrl + this.URLs.root,
            query,
        };
        return this._get(options);
    }

    async listDrives(query = null) {
        const options = {
            url: this.baseUrl + this.URLs.drives,
            query,
        };
        return this._get(options);
    }

    async listFiles(query = null, trashed = false) {
        const options = {
            url: this.baseUrl + this.URLs.files,
            query,
            trashed,
        };
        return this._get(options);
    }

    async listFolders(query = null) {
        return this.listFiles({
            ...query,
            q: "mimeType='application/vnd.google-apps.folder'",
        });
    }

    async getFile(fileId, query) {
        const options = {
            url: this.baseUrl + this.URLs.fileById(fileId),
            query,
        };
        return this._get(options);
    }

    async getFileData(fileId) {
        const options = {
            url: this.baseUrl + this.URLs.fileById(fileId),
            query: {
                alt: 'media',
            },
        };
        return this._get(options);
    }

    async getFileLabels(fileId) {
        const options = {
            url: this.baseUrl + this.URLs.fileLabels(fileId),
        };
        return this._get(options);
    }
}

module.exports = { Api };
