const { OAuth2Requester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.access_token = get(params, 'access_token', null);
        this.refresh_token = get(params, 'refresh_token', null);
        this.baseURL = process.env.AIRWALLEX_BASE_URL;

        //this.api_key = process.env.AIRWALLEX_API_KEY;
        this.api_key = get(params, 'api_key', null);
        //this.client_id = process.env.AIRWALLEX_CLIENT_ID;
        this.client_id = get(params, 'client_id', null);
        this.client_secret = process.env.AIRWALLEX_CLIENT_SECRET;

        this.accessTokenUri = `${this.baseURL}/api/v1/authentication/login`;

        //this.authorizationUri = ...
        //this.tokenUri = ...

        this.URLs = {
            transactions: '/api/v1/financial_transactions',
            payments: '/api/v1/pa/payment_attempts',
            charges: '/api/v1/charges',
            cards: '/api/v1/issuing/cards',
            currentBalance: '/api/v1/balances/current',
            balanceHistory: '/api/v1/balances/history',
            createCard: '/api/v1/issuing/cards/create',
            cardById: (cardId) => `/api/v1/issuing/cards/${cardId}`,
            account: '/api/v1/account',
            customer: '/api/v1/pa/customers',
            createCustomer: '/api/v1/pa/customers/create',
            beneficiary: '/api/v1/beneficiaries',
            beneficiaryById: (beneficiaryId) =>
                `/api/v1/beneficiaries/${beneficiaryId}`,
            updateBeneficiary: (beneficiaryId) =>
                `/api/v1/beneficiaries/update/${beneficiaryId}`,
            createBeneficiary: '/api/v1/beneficiaries/create',
            paymentLinkCreate: '/api/v1/pa/payment_links/create',
            sendPaymentLink: (id) =>
                `/api/v1/pa/payment_links/${id}/notify_shopper`,
            createCardholder: '/api/v1/issuing/cardholders/create',
            createTransfer: '/api/v1/transfers/create',
            cardRemainingLimits: (cardId) =>
                `/api/v1/issuing/cards/${cardId}/limits`,
        };
    }
    //Remove both getTokenFromApiKey and refreshAuth when ready for OAuth2
    async getTokenFromApiKey() {
        const options = {
            url: this.accessTokenUri,
            headers: {
                'x-api-key': this.api_key,
                'x-client-id': this.client_id,
            },
        };

        const res = await this._post(options);
        this.access_token = res.token;
    }

    async refreshAuth() {
        await this.getTokenFromApiKey();
    }

    async getAccount() {
        const options = {
            url: this.baseURL + this.URLs.account,
        };
        const res = await this._get(options);
        return res;
    }

    async getTransactions(params) {
        const options = {
            url: this.baseURL + this.URLs.transactions,
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

    async getPaymentAttempts() {
        const options = {
            url: this.baseURL + this.URLs.payments,
        };
        const res = await this._get(options);
        return res;
    }

    async getCharges() {
        const options = {
            url: this.baseURL + this.URLs.charges,
        };
        const res = await this._get(options);
        return res;
    }

    async getCurrentBalance() {
        const options = {
            url: this.baseURL + this.URLs.currentBalance,
        };
        const res = await this._get(options);
        return res;
    }

    async getBalanceHistory() {
        const options = {
            url: this.baseURL + this.URLs.balanceHistory,
        };
        const res = await this._get(options);
        return res;
    }

    async createCard(card) {
        const options = {
            url: this.baseURL + this.URLs.createCard,
            headers: {
                'content-type': 'application/json',
            },
            body: card,
        };
        const res = await this._post(options);
        return res;
    }

    async getAllCards() {
        const options = {
            url: this.baseURL + this.URLs.cards,
        };
        const res = await this._get(options);
        return res;
    }

    async getCardById(cardId) {
        const options = {
            url: this.baseURL + this.URLs.cardById(cardId),
        };
        const res = await this._get(options);
        return res;
    }

    async getCustomers() {
        const options = {
            url: this.baseURL + this.URLs.customer,
        };
        const res = await this._get(options);
        return res;
    }

    async createCustomer(customer) {
        const options = {
            url: this.baseURL + this.URLs.createCustomer,
            headers: {
                'content-type': 'application/json',
            },
            body: customer,
        };
        const res = await this._post(options);
        return res;
    }

    async getBeneficiaries() {
        const options = {
            url: this.baseURL + this.URLs.beneficiary,
        };
        const res = await this._get(options);
        return res;
    }

    async getBeneficiaryByID(id) {
        const options = {
            url: this.baseURL + this.URLs.beneficiaryById(id),
        };
        const res = await this._get(options);
        return res;
    }

    async updateBeneficiary(id, beneficiary) {
        const options = {
            url: this.baseURL + this.URLs.updateBeneficiary(id),
            headers: {
                'content-type': 'application/json',
            },
            body: beneficiary,
        };
        const res = await this._post(options);
        return res;
    }

    async createBeneficiary(beneficiary) {
        const options = {
            url: this.baseURL + this.URLs.createBeneficiary,
            headers: {
                'content-type': 'application/json',
            },
            body: beneficiary,
        };
        const res = await this._post(options);
        return res;
    }

    async createPaymentLink(paymentLinkBody) {
        const options = {
            url: this.baseURL + this.URLs.paymentLinkCreate,
            headers: {
                'content-type': 'application/json',
            },
            body: paymentLinkBody,
        };
        const res = await this._post(options);
        return res;
    }

    async sendPaymentLink(paymentLinkBody, id) {
        const options = {
            url: this.baseURL + this.URLs.sendPaymentLink(id),
            headers: {
                'content-type': 'application/json',
            },
            body: paymentLinkBody,
        };
        const res = await this._post(options);
        return res;
    }

    async createCardholder(cardholder) {
        const options = {
            url: this.baseURL + this.URLs.createCardholder,
            headers: {
                'content-type': 'application/json',
            },
            body: cardholder,
        };
        const res = await this._post(options);
        return res;
    }

    async createTransfer(transfer) {
        const options = {
            url: this.baseURL + this.URLs.createTransfer,
            headers: {
                'content-type': 'application/json',
            },
            body: transfer,
        };
        const res = await this._post(options);
        return res;
    }

    async cardRemainingLimits(cardId) {
        const options = {
            url: this.baseURL + this.URLs.cardRemainingLimits(cardId),
        };
        const res = await this._get(options);
        return res;
    }
}

module.exports = { Api };
