const OAuth2Base = require('../../base/auth/OAuth2Base');

class HugggAPI extends OAuth2Base {
    constructor(params) {
        super(params);
        this.client_id = this.getParam(params, 'client_id', null);
        this.client_secret = this.getParam(params, 'client_secret', null);
        this.access_token = this.getParam(params, 'access_token', null);
        this.refresh_token = this.getParam(params, 'refresh_token', null);
        this.username = this.getParam(params, 'username', null);
        this.password = this.getParam(params, 'password', null);
        this.isSandbox = this.getParam(params, 'isSandbox', false);

        if (this.isSandbox === true) {
            this.baseURL = 'https://beta.api.huggg.me';
        } else {
            this.baseURL = 'https://api.huggg.me';
        }

        this.tokenUri = `${this.baseURL}/oauth/token`;

        this.URLs = {
            listProducts: '/api/v2/products',
            getHugggDetails: (hugggId) => `/api/v2/hugggs/${hugggId}`,
            getTransactions: '/api/v2/transactions',
            createTransaction: '/api/v2/transactions?embed[]=hugggs',
            getHugggsFromTransaction: (transactionId) =>
                `/api/v2/transactions/${transactionId}/hugggs`,
            getUser: '/api/v2/auth/me',
            getTeam: (teamId) => `/api/v2/teams/${teamId}`,
            getWallets: (teamId) => `/api/v2/teams/${teamId}/wallets`,
            search: '/api/v2/search',
            getPurchasedHugggs: '/api/v2/hugggs/sent',
        };
    }

    async refreshAccessToken(refreshTokenObject) {
        const options = {
            url: this.tokenUri,
            body: {
                client_id: this.client_id,
                client_secret: this.client_secret,
                refresh_token: refreshTokenObject.refresh_token,
                grant_type: 'refresh_token',
            },
            headers: {
                'Content-Type': 'application/json',
            },
        };
        const response = await this._post(options, true);
        await this.setTokens(response);
        return response;
    }

    async getUser() {
        const options = {
            url: this.baseURL + this.URLs.getUser,
        };
        const res = await this._get(options);
        return res;
    }

    async getTeam(teamId) {
        const options = {
            url: this.baseURL + this.URLs.getTeam(teamId),
        };
        const res = await this._get(options);
        return res;
    }

    async getWallets(teamId) {
        const options = {
            url: this.baseURL + this.URLs.getWallets(teamId),
        };
        const res = await this._get(options);
        return res;
    }

    async listProducts() {
        const options = {
            url: this.baseURL + this.URLs.listProducts,
        };
        const res = await this._get(options);
        return res;
    }

    async getHugggDetails(id) {
        const options = {
            url: this.baseURL + this.URLs.getHugggDetails(id),
        };
        const res = await this._get(options);
        return res;
    }

    async getTransactions() {
        const options = {
            url: this.baseURL + this.URLs.getTransactions,
        };
        const res = await this._get(options);
        return res;
    }

    async createTransaction(purchase) {
        const options = {
            url: this.baseURL + this.URLs.createTransaction,
            headers: {
                'content-type': 'application/json',
            },
            body: purchase,
        };
        const res = await this._post(options);
        return res;
    }

    async getHugggsfromTransaction(id) {
        const options = {
            url: this.baseURL + this.URLs.getHugggsFromTransaction(id),
        };
        const res = await this._get(options);
        return res;
    }

    async search(query) {
        const options = {
            url: this.baseURL + this.URLs.search,
            headers: {
                'content-type': 'application/json',
            },
            body: {
                from: 0,
                size: 300,
                query: {
                    bool: {
                        must: [
                            {
                                match: {
                                    status: {
                                        query,
                                        operator: 'or',
                                    },
                                },
                            },
                        ],
                    },
                },
                sort: [
                    {
                        'huggg.created_at': {
                            order: 'desc',
                        },
                    },
                ],
            },
        };
        const res = await this._post(options);
        return res;
    }

    async getPurchasedHugggs() {
        const options = {
            url: this.baseURL + this.URLs.getPurchasedHugggs,
        };
        const res = await this._get(options);
        return res;
    }
}
module.exports = HugggAPI;
