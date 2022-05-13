const OAuth2Base = require('@friggframework/core/auth/OAuth2Base');

class SalesloftAPI extends OAuth2Base {
    constructor(params) {
        super(params);
        this.access_token = get(params, 'access_token', null);
        this.refresh_token = get(params, 'refresh_token', null);
        this.baseURL = 'https://api.salesloft.com';

        this.client_id = process.env.SALESLOFT_CLIENT_ID;
        this.client_secret = process.env.SALESLOFT_CLIENT_SECRET;
        this.redirect_uri = `${process.env.REDIRECT_URI}/salesloft`;

        this.URLs = {
            authorization: 'https://accounts.salesloft.com/oauth/authorize',
            access_token: 'https://accounts.salesloft.com/oauth/token',
            people: '/v2/people.json',
            // listPeople: "v2/people.json",
            personById: (personId) => `/v2/people/${personId}.json`,
            accounts: '/v2/accounts.json',
            accountsById: (accountId) => `/v2/accounts/${accountId}.json`,
            // createPerson: 'v2/people.json'
            getTeam: '/v2/team.json',
            users: '/v2/users.json',
            tasks: '/v2/tasks.json',
            taskById: (taskId) => `/v2/tasks/${taskId}.json`,
            userById: (userId) => `/v2/users/${userId}.json`,
        };

        this.authorizationUri = encodeURI(
            `https://accounts.salesloft.com/oauth/authorize?client_id=${this.client_id}&redirect_uri=${this.redirect_uri}&response_type=code`
        );

        this.tokenUri = 'https://accounts.salesloft.com/oauth/token';
    }

    async getTeam() {
        const options = {
            url: this.baseURL + this.URLs.getTeam,
        };
        const res = await this._get(options);
        return res;
    }

    async listPeople(params) {
        const options = {
            url: this.baseURL + this.URLs.people,
            query: {},
        };

        if (params) {
            for (const param in params) {
                options.query[param] = get(params, `${param}`, null);
            }
        }
        const res = await this._get(options);
        return res;
    }

    async listUsers() {
        const options = {
            url: this.baseURL + this.URLs.users,
        };
        const res = await this._get(options);
        return res;
    }

    async getPersonById(id) {
        const options = {
            url: this.baseURL + this.URLs.personById(id),
        };
        const res = await this._get(options);
        return res;
    }

    async listAccounts(params) {
        const options = {
            url: this.baseURL + this.URLs.accounts,
            query: {},
        };

        if (params) {
            for (const param in params) {
                options.query[param] = get(params, `${param}`, null);
            }
        }
        const res = await this._get(options);
        return res;
    }

    async getAccountsById(id) {
        const options = {
            url: this.baseURL + this.URLs.accountsById(id),
        };
        const res = await this._get(options);
        return res;
    }

    async createPerson(person) {
        const options = {
            url: this.baseURL + this.URLs.people,
            headers: {
                'content-type': 'application/json',
            },
            body: person,
        };
        const res = await this._post(options);
        return res;
    }

    async deletePerson(id) {
        const options = {
            url: this.baseURL + this.URLs.personById(id),
        };
        const res = await this._delete(options);
        return res;
    }

    async updatePerson(id, person) {
        const options = {
            url: this.baseURL + this.URLs.personById(id),
            headers: {
                'content-type': 'application/json',
            },
            body: person,
        };
        const res = await this._put(options);
        return res;
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

    async deleteTask(id) {
        const options = {
            url: this.baseURL + this.URLs.taskById(id),
        };
        const res = await this._delete(options);
        return res;
    }

    async updateTask(id, task) {
        const options = {
            url: this.baseURL + this.URLs.taskById(id),
            headers: {
                'content-type': 'application/json',
            },
            body: task,
        };
        const res = await this._put(options);
        return res;
    }

    async getUserById(id) {
        const options = {
            url: this.baseURL + this.URLs.userById(id),
        };
        const res = await this._get(options);
        return res;
    }
}
module.exports = SalesloftAPI;
