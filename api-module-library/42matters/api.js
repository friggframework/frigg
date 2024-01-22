const { OAuth2Requester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');


class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.access_token = get(params, 'access_token', null);
        this.baseUrl = 'https://data.42matters.com/api/v2.0/';
        this.endpoints = {
            accountStatus: 'account.json',
            googleLookup: 'android/apps/lookup.json',
            appleLookup: 'ios/apps/lookup.json',
            tencentLookup: 'tencent/android/apps/lookup.json',
            amazonLookup: 'amazon/android/apps/lookup.json'
        }
        this.URLs = {}
        this.generateUrls();
    }

    generateUrls() {
        for (const key in this.endpoints) {
            if (this.endpoints[key] instanceof Function) {
                this.URLs[key] = (...params) => this.baseUrl + this.endpoints[key](...params)
            } else {
                this.URLs[key] = this.baseUrl + this.endpoints[key];
            }
        }
    }

    async _request(url, options, i = 0) {
        options.query.access_token = this.access_token;
        return super._request(url, options, i);
    }

    // API METHODS

    async getAccountStatus() {
        const options = {
            url: this.URLs.accountStatus
        }
        return this._get(options);
    }

    async getGoogleAppData(packageName) {
        const options = {
            url: this.URLs.googleLookup,
            query: {
                p: packageName
            }
        }
        return this._get(options);
    }
}

module.exports = { Api };
