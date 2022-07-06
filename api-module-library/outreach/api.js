const OAuth2Base = require('@friggframework/core/auth/OAuth2Base');

class Api extends OAuth2Base {
    constructor(params) {
        super(params);
        this.access_token = get(params, 'access_token', null);
        this.refresh_token = get(params, 'refresh_token', null);
        this.baseURL = 'https://api.outreach.io';

        this.client_id = process.env.OUTREACH_CLIENT_ID;
        this.client_secret = process.env.OUTREACH_CLIENT_SECRET;
        this.redirect_uri = `${process.env.REDIRECT_URI}/outreach`;
        this.scopes = process.env.OUTREACH_SCOPES;

        this.URLs = {
            authorization: 'https://api.outreach.io/oauth/authorize',
            access_token: 'https://api.outreach.io/oauth/token',
            accounts: '/api/v2/accounts',
            tasks: '/api/v2/tasks',
            taskById: (taskId) => `/api/v2/tasks/${taskId}`,
            getUser: '/api/userprofile',
        };

        this.authorizationUri = encodeURI(
            `https://api.outreach.io/oauth/authorize?client_id=${this.client_id}&redirect_uri=${this.redirect_uri}&response_type=code&scope=${this.scopes}`
        );

        this.tokenUri = 'https://api.outreach.io/oauth/token';
    }

    async listAccounts(params) {
        const options = {
            url: this.baseURL + this.URLs.accounts,
            query: params.query,
        };
        const res = await this._get(options);
        return res;
    }

    async listAllAccounts(params) {
        const defaultQuery = {
            'page[size]': 1000,
            count: false,
        };
        const query = get(params, 'query', defaultQuery);
        const res = await this.listAccounts({ query });
        let nextPages = [];
        if (res.links?.next) {
            delete query['page[after]'];
            const newQuery = {
                'page[after]': decodeURIComponent(
                    res.links.next
                        .split('?')[1]
                        .split('&')[0]
                        .split('page%5Bafter%5D=')[1]
                ),
                ...query,
            };
            nextPages = await this.listAllAccounts({ query: newQuery });
        }
        const results = res.data.concat(nextPages);
        return results;
    }

    async createTask(task) {
        const options = {
            url: this.baseURL + this.URLs.tasks,
            headers: {
                'content-type': 'application/json',
            },
            body: task,
        };
        const res = await this._post(options);
        return res;
    }

    async getTasks() {
        const options = {
            url: this.baseURL + this.URLs.tasks,
        };
        const res = await this._get(options);
        return res;
    }

    async deleteTask(taskId) {
        const options = {
            url: this.baseURL + this.URLs.taskById(taskId),
        };
        const res = await this._delete(options);
        return res;
    }

    async updateTask(taskId, task) {
        const options = {
            url: this.baseURL + this.URLs.taskById(taskId),
            headers: {
                'content-type': 'application/json',
            },
            body: task,
        };
        const res = await this._patch(options);
        return res;
    }

    async getUser() {
        const options = {
            url: this.baseURL + this.URLs.getUser,
        };
        const res = await this._get(options);
        return res;
    }
}
module.exports = { Api };
