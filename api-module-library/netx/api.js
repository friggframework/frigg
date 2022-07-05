const OAuth2Base = require('@friggframework/core/auth/OAuth2Base');
const { get } = require('@friggframework/assertions');

const uuid = require('uuid');

const FormData = require('form-data');
const path = require('path');
const fs = require('fs');

class Api extends OAuth2Base {
    constructor(params) {
        super(params);
        this.client_id = get(params, 'client_id', null);
        this.access_token = get(params, 'access_token', null);
        this.refresh_token = get(params, 'refresh_token', null);
        this.baseURL = process.env.NETX_BASE_URL;
        this.tokenUri = `${this.baseURL}/a/t`;
        this.scope = process.env.NETX_SCOPE;
        this.state = process.env.NETX_STATE;
        this.redirect_uri = `${process.env.REDIRECT_URI}/netx`;

        this.authorizationUri = encodeURI(
            `${this.baseURL}/app?response_type=code&client_id=${this.client_id}&state=${this.state}&scope=${this.scope}&redirect_uri=${this.redirect_uri}#access/api`
        );

        this.URLs = {
            rpc: '/api/rpc',
            importAsset: '/api/import/asset',
        };

        this.methods = {
            getAssetsByFolder: 'getAssetsByFolder',
            getAssetsByQuery: 'getAssetsByQuery',
            getAssets: 'getAssets',
            updateAsset: 'updateAsset',
        };
    }

    async _request(url, options, i = 0) {
        let encodedUrl = encodeURI(url);
        if (options.query) {
            let queryBuild = '?';
            for (const key in options.query) {
                queryBuild += `${encodeURIComponent(key)}=${encodeURIComponent(
                    options.query[key]
                )}&`;
            }
            encodedUrl += queryBuild.slice(0, -1);
        }

        options.headers = await this.addAuthHeaders(options.headers);

        const response = await this.fetch(encodedUrl, options);
        const { status } = response;

        const responseBody = await this.parsedBody(response);

        // If the status is retriable and there are back off requests left, retry the request
        if ((status === 429 || status >= 500) && i < this.backOff.length) {
            const delay = this.backOff[i] * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
            return this._request(url, options, i + 1);
        } else if (responseBody.error && responseBody.error.code === 10000) {
            if (!this.isRefreshable || this.refreshCount > 0) {
                await this.notify(this.DLGT_INVALID_AUTH);
            } else {
                this.refreshCount++;
                this.isRefreshable = false; // Set so that if we 401 during refresh request, we hit the above block
                await this.refreshAuth();
                // this.isRefreshable = true;// Set so that we can retry later? in case it's a fast expiring auth
                this.refreshCount = 0;
                return this._request(url, options, i + 1); // Retries
            }
        }

        // If the error wasn't retried, throw.
        if (status >= 400) {
            throw await FetchError.create({
                resource: encodedUrl,
                init: options,
                response,
            });
        }

        return responseBody;
    }

    async addAuthHeaders(headers) {
        if (this.access_token) {
            headers.Authorization = `apiToken ${this.access_token}`;
        }

        return headers;
    }

    async getAssetsByFolder(folderId) {
        const options = {
            url: this.baseURL + this.URLs.rpc,
            headers: {
                'content-type': 'application/json',
            },
            body: {
                id: uuid.v4(),
                method: this.methods.getAssetsByFolder,
                params: [
                    folderId,
                    false,
                    {
                        page: {
                            startIndex: 0,
                            size: 100,
                        },
                        data: ['asset.id', 'asset.base'],
                    },
                ],
                jsonrpc: '2.0',
            },
        };
        const response = await this._post(options);
        return response;
    }

    async getAssetsByQuery(query) {
        const options = {
            url: this.baseURL + this.URLs.rpc,
            headers: {
                'content-type': 'application/json',
            },
            body: {
                id: uuid.v4(),
                method: this.methods.getAssetsByQuery,
                params: [
                    {
                        query,
                    },
                    {
                        sort: {
                            field: 'name',
                            order: 'asc',
                        },
                        data: ['asset.id', 'asset.base', 'asset.attributes'],
                    },
                ],
                jsonrpc: '2.0',
            },
        };
        const response = await this._post(options);
        return response;
    }

    async getAssets(assetId) {
        const options = {
            url: this.baseURL + this.URLs.rpc,
            headers: {
                'content-type': 'application/json',
            },
            body: {
                id: uuid.v4(),
                method: this.methods.getAssets,
                params: [
                    [assetId],
                    {
                        data: ['asset.base', 'asset.file'],
                    },
                ],
                jsonrpc: '2.0',
            },
        };
        const response = await this._post(options);
        return response;
    }

    async importAsset(asset, folderId) {
        const form = new FormData();
        const stats = fs.statSync(asset.filePath);
        const fileSizeInBytes = stats.size;
        const fileStream = fs.createReadStream(asset.filePath);
        const fileName = path.basename(asset.filePath);
        form.append('file', fileStream, {
            filename: fileName,
            knownLength: fileSizeInBytes,
        });
        form.append('folderId', folderId); // Some variable for folderId, or a default? what's root?
        form.append('fileName', fileName);

        const options = {
            url: this.baseURL + this.URLs.importAsset,
            method: 'POST',
            headers: {},
            credentials: 'include',
            body: form,
        };
        const response = await this._request(options.url, options);
        return response;
    }

    async updateAsset(assetId, name, fileName) {
        const options = {
            url: this.baseURL + this.URLs.rpc,
            headers: {
                'content-type': 'application/json',
            },
            body: {
                id: uuid.v4(),
                method: this.methods.updateAsset,
                params: [
                    {
                        id: assetId,
                        name,
                        fileName,
                    },
                    {
                        data: ['asset.base'],
                    },
                ],
                jsonrpc: '2.0',
            },
        };
        const response = await this._post(options);
        return response;
    }
}

module.exports = { Api };
