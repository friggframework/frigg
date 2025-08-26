const fetch = require('node-fetch');
const { Delegate } = require('../../core');
const { FetchError } = require('../../errors');
const { get } = require('../../assertions');

class Requester extends Delegate {
    constructor(params) {
        super(params);
        this.backOff = get(params, 'backOff', [1, 3, 10, 30, 60, 180]);
        this.isRefreshable = false;
        this.refreshCount = 0;
        this.DLGT_INVALID_AUTH = 'INVALID_AUTH';
        this.delegateTypes.push(this.DLGT_INVALID_AUTH);
        this.agent = get(params, 'agent', null);

        // Allow passing in the fetch function
        // Instance methods can use this.fetch without differentiating
        this.fetch = get(params, 'fetch', fetch);
    }

    parsedBody = async (resp) => {
        const contentType = resp.headers.get('Content-Type') || '';

        if (
            contentType.match(/^application\/json/) ||
            contentType.match(/^application\/vnd.api\+json/) ||
            contentType.match(/^application\/hal\+json/)
        ) {
            return resp.json();
        }

        return resp.text();
    };

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

        if (this.agent) options.agent = this.agent;

        let response;
        try {
            response = await this.fetch(encodedUrl, options);
        } catch (e) {
            if (e.code === 'ECONNRESET' && i < this.backOff.length) {
                const delay = this.backOff[i] * 1000;
                await new Promise((resolve) => setTimeout(resolve, delay));
                return this._request(url, options, i + 1);
            }
            throw await FetchError.create({
                resource: encodedUrl,
                init: options,
                responseBody: e,
            });
        }
        const { status } = response;

        // If the status is retriable and there are back off requests left, retry the request
        if ((status === 429 || status >= 500) && i < this.backOff.length) {
            const delay = this.backOff[i] * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
            return this._request(url, options, i + 1);
        } else if (status === 401) {
            if (!this.isRefreshable || this.refreshCount > 0) {
                await this.notify(this.DLGT_INVALID_AUTH);
            } else {
                this.refreshCount++;
                await this.refreshAuth();
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

        return options.returnFullRes
            ? response
            : await this.parsedBody(response);
    }

    async _get(options) {
        const fetchOptions = {
            method: 'GET',
            credentials: 'include',
            headers: options.headers || {},
            query: options.query || {},
            returnFullRes: options.returnFullRes || false,
        };

        const res = await this._request(options.url, fetchOptions);
        return res;
    }

    async _post(options, stringify = true) {
        console.log('options', options);
        const fetchOptions = {
            method: 'POST',
            credentials: 'include',
            headers: options.headers || {},
            query: options.query || {},
            body: stringify ? JSON.stringify(options.body) : options.body,
            returnFullRes: options.returnFullRes || false,
        };
        const res = await this._request(options.url, fetchOptions);
        return res;
    }

    async _patch(options, stringify = true) {
        const fetchOptions = {
            method: 'PATCH',
            credentials: 'include',
            headers: options.headers || {},
            query: options.query || {},
            body: stringify ? JSON.stringify(options.body) : options.body,
            returnFullRes: options.returnFullRes || false,
        };
        const res = await this._request(options.url, fetchOptions);
        return res;
    }

    async _put(options, stringify = true) {
        const fetchOptions = {
            method: 'PUT',
            credentials: 'include',
            headers: options.headers || {},
            query: options.query || {},
            body: stringify ? JSON.stringify(options.body) : options.body,
            returnFullRes: options.returnFullRes || false,
        };
        const res = await this._request(options.url, fetchOptions);
        return res;
    }

    async _delete(options) {
        const fetchOptions = {
            method: 'DELETE',
            credentials: 'include',
            headers: options.headers || {},
            query: options.query || {},
            returnFullRes: options.returnFullRes || true,
        };
        return this._request(options.url, fetchOptions);
    }

    async refreshAuth() {
        throw new Error('refreshAuth not yet defined in child of Requester');
    }
}

module.exports = { Requester };
