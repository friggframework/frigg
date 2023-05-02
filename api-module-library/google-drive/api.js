const { OAuth2Requester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);

        this.baseUrl = "https://www.googleapis.com/";

        this.URLs = {
            about:  "/drive/v3/about",
            fileById : (fileId) => `/drive/v3/files/${fileId}`,
            files : "/drive/v3/files",
            fileUpload : "/upload/drive/v3/files",
            permissions : '/permissions',
        };

        this.authorizationUri = encodeURI(
            `https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=${this.client_id}&redirect_uri=${this.redirect_uri}&scope=${this.scope}&access_type=offline&include_granted_scopes=true`
        );
        this.tokenUri = 'https://oauth2.googleapis.com/token';

        /* eslint-disable camelcase */
        this.access_token = get(params, 'access_token', null);
        this.refresh_token = get(params, 'refresh_token', null);
        /* eslint-enable camelcase */
    }

    async getTokenFromCode(code) {
        return this.getTokenFromCodeBasicAuthHeader(code);
    }

    async getTokenIdentity() {
        const options = {
            url: this.baseUrl + this.URLs.me,
        };

        const res = await this._get(options);
        return res;
    }

    async getAbout(fields='*') {
        const options = {
            url: this.baseUrl + this.URLs.about,
            query: {
                fields
            }
        };

        const res = await this._get(options);
        return res;
    }

    async getUserDetails(){
        return await this.getAbout('user');
    }

    async listFiles(query=null, trashed=false){
        const options = {
            url: this.baseUrl + this.URLs.files,
            query,
            trashed
        };

        const res = await this._get(options);
        return res;
    }

    async getFileById(fileId, query){

        const options = {
            url: this.baseUrl + this.URLs.fileById(fileId),
            query
        };

        const res = await this._get(options);
        return res;
    }

    async getFileDataById(fileId){
        const options = {
            url: this.baseUrl + this.URLs.fileById(fileId),
            query: {
                alt:'media'
            }
        };

        const res = await this._get(options);
        return res;
    }
}

module.exports = { Api };
