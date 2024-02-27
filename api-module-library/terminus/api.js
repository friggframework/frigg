const { FetchError, ApiKeyRequester } = require('@friggframework/core');

class Api extends ApiKeyRequester {
    constructor(params) {
        super(params);
        this.API_KEY_VALUE = `Bearer ${params.api_key}`;
        this.API_KEY_NAME = 'Authorization';
        this.baseUrl = 'https://api.terminusplatform.com';

        this.URLs = {
            accountLists: '/accountLists/v2/accountLists',
            folders: '/accountLists/v2/folders',
            addAccountsToList: (listId) =>
                `/accountLists/v2/accountLists/${listId}/accounts/add`,
            removeAccountsFromList: (listId) =>
                `/accountLists/v2/accountLists/${listId}/accounts/remove`,
        };
    }

    setApiKey(api_key) {
        this.API_KEY_VALUE = `Bearer ${api_key}`;
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

        const res = await this.fetch(encodedUrl, options);

        if (res.status === 429 && i < this.backOff.length) {
            const delay = this.backOff[i] * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
            return this._request(url, options, i + 1);
        } else if (res.status === 401 || res.status > 499) {
            if (!this.isRefreshable || this.refreshCount > 0) {
                await this.notify(this.DLGT_INVALID_AUTH);
                throw await FetchError.create({
                    resource: encodedUrl,
                    init: options,
                    response: res,
                });
            } else {
                this.refreshCount++;
                // this.isRefreshable = false; // Set so that if we 401 during refresh request, we hit the above block
                await this.refreshAuth();
                // this.isRefreshable = true;// Set so that we can retry later? in case it's a fast expiring auth
                this.refreshCount = 0;
                return this._request(url, options, i + 1); // Retries
            }
        } else if (res.status >= 400) {
            throw await FetchError.create({
                resource: encodedUrl,
                init: options,
                response: res,
            });
        }

        return options.returnFullRes ? res : await this.parsedBody(res);
    }

    async listAccountLists() {
        const options = {
            url: this.baseUrl + this.URLs.accountLists,
        };
        return await this._get(options);
    }

    async listFolders() {
        const options = {
            url: this.baseUrl + this.URLs.folders,
        };
        return await this._get(options);
    }

    async createAccountList(body) {
        const options = {
            url: this.baseUrl + this.URLs.accountLists,
            body: body,
        };
        return await this._post(options);
    }

    async createFolder(body) {
        const options = {
            url: this.baseUrl + this.URLs.folders,
            body: body,
        };
        return await this._post(options);
    }

    async addAccountsToList(listId, body) {
        const options = {
            url: this.baseUrl + this.URLs.addAccountsToList(listId),
            body: body,
        };
        return await this._post(options);
    }

    async removeAccountsFromList(listId, body) {
        const options = {
            url: this.baseUrl + this.URLs.removeAccountsFromList(listId),
            body: body,
        };
        return await this._post(options);
    }
}

module.exports = { Api };
