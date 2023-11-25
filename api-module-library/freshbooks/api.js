const { OAuth2Requester } = require('@friggframework/module-plugin');

class Api extends OAuth2Requester {

    constructor(params) {
        super(params);
        this.access_token = params.access_token;
        this.refresh_token = params.refresh_token;
        this.accountId = params.accountId;
        this.baseUrl = `https://api.freshbooks.com`;
        this.URLs = {
            createExpense: () => `${this.baseUrl}/accounting/account/${this.accountId}/expenses/expenses`,
            listStaff: () => `${this.baseUrl}/accounting/account/${this.accountId}/users/staffs`,
            listExpenseCategories: () => `${this.baseUrl}/accounting/account/${this.accountId}/expenses/categories`,
            otherIncomes: () => `${this.baseUrl}/accounting/account/${this.accountId}/other_incomes/other_incomes`,
            client: `/accounting/account/${this.accountId}/users/clients`,
            token: '/auth/oauth/token',
            user_info: `/auth/api/v1/users/me`,
        };
        this.tokenUri = `${this.baseUrl}${this.URLs.token}`;
    }

    getAuthUri(params) {
        console.log('Freshbooks: getAuthUri', params, process.env.REDIRECT_URI);
        const state = JSON.stringify({ app: 'freshbooks' });
        const redirect_uri = params?.redirect_uri ?? process.env.REDIRECT_URI ?? '';
        return [
            'https://my.freshbooks.com/service/auth/oauth/authorize?response_type=code',
            `client_id=${this.client_id}`,
            `state=${state}`,
            `redirect_uri=${redirect_uri}`,
        ].join('&');
    }

    async addAuthHeaders(headers) {
        const baseHeaders = await super.addAuthHeaders(headers);
        baseHeaders['Api-Version'] = 'alpha';
        return baseHeaders;
    }

    setAccountId(accountId) {
        this.accountId = accountId;
    }

    setAccessToken(access_token) {
        this.access_token = access_token;
    }

    setRefreshToken(refresh_token) {
        this.refresh_token = refresh_token;
    }

    async getUserInfo() {
        try {
            const res = await this._get({
                url: this.baseUrl + this.URLs.user_info,
            });
            const identity = {
                id: res.response.id,
                user_name:
                    res.response.first_name + ' ' + res.response.last_name,
                user_email: res.response.email,
            };

            return identity;
        } catch (e) {
            console.log('Get User Info error:', e.message);
            throw e;
        }
    }

    async getUserEmail() {
        try {
            const res = await this._get({
                url: this.baseUrl + this.URLs.user_info,
            });
            return res.response.email;
        } catch (e) {
            console.log('Get User Info error:', e.message);
            throw e;
        }
    }

    async retrieveAccounts(){
        const res = await this._get({
            url: this.baseUrl + this.URLs.user_info,
        });

        let memberships = res.response.business_memberships;
        let accounts = memberships.map(
            (mem) => {
                return {
                    name: mem.business.name,
                    id: mem.business.account_id,
                    // country: mem.business.address.country
                };
            }
        );

        return accounts;
    }

    async createOtherIncome(otherIncome) {
        const body = {
            other_income: otherIncome,
        };

        return await this._post({
            body,
            url: this.URLs.otherIncomes(),
        });
    }

    async createExpense(input){
        const date = [
            String(input.date.getFullYear()),
            String(input.date.getMonth() + 1).padStart(2, '0'),
            String(input.date.getDate() + 1).padStart(2, '0'),
        ].join('-');
        const body = {
            expense: {
                amount: {
                    amount: String(input.amount),
                    code: input.code,
                },
                categoryid: input.categoryid,
                staffid: input.staffid,
                date,
                notes: input.description,
            },
        };

        return this._post({
            body,
            url: this.URLs.createExpense(),
        });
    }

    async listExpenseCategories(params){
        const query = params?.name ? { query: { 'search[name]': params.name } } : {};
        const options = {
            method: 'GET',
            url: this.URLs.listExpenseCategories(),
            headers: await this.addAuthHeaders({}),
            ...query,
        };
        console.log('listExpenseCategories options:', options);
        return this._get(options);
    }

    async listStaff() {
        const options = {
            method: 'GET',
            url: this.URLs.listStaff(),
            headers: await this.addAuthHeaders({}),
        };
        console.log('listStaff options:', options);
        return this._get(options);
    }

    async updateOtherIncome(otherIncome, id) {
        const body = {
            other_income: otherIncome,
        };

        const url = this.URLs.otherIncomes() + '/' + id;

        return await this._put({
            body,
            url,
        });
    }
}

module.exports = { Api }
