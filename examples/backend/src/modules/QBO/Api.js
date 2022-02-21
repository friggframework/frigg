const OAuth2Base = require('../../base/auth/OAuth2Base');
const LHBaseClass = require('../../base/LHBaseClass');
const moment = require('moment');

const fetch = require('node-fetch');
const OAuthClient = require('intuit-oauth');

const oauthClient = new OAuthClient({
    clientId: process.env.QBO_OAUTH_KEY,
    clientSecret: process.env.QBO_OAUTH_SECRET,
    environment: process.env.QBO_OAUTH_ENV, // 'sandbox' || 'production',
    redirectUri: process.env.QBO_OAUTH_REDIRECT_URI,
});

const QuickBooks = require('node-quickbooks');
const util = require('util');

class QuickBooksPromise extends LHBaseClass {
    constructor(params) {
        super(params);
        this.key = this.getParam(params, 'key');
        this.secret = this.getParam(params, 'secret');
        this.accessToken = this.getParam(params, 'accessToken');
        this.refreshToken = this.getParam(params, 'refreshToken');
        this.realmId = this.getParam(params, 'realmId');
        this.environment = this.getParam(params, 'environment');
        this.refreshTokenFunction = this.getParam(
            params,
            'refreshTokenFunction'
        );
        this.qbo = new QuickBooks(
            this.key,
            this.secret,
            this.accessToken,
            false, // no token secret for oAuth 2.0
            this.realmId,
            this.environment == 'sandbox', // use the sandbox?
            true, // enable debugging?
            null, // set minorversion, or null for the latest version
            '2.0', // oAuth version
            this.refreshToken
        );

        for (const functionName in this.qbo.__proto__) {
            const _this = this;

            if (typeof this.qbo[functionName] === 'function') {
                this.__proto__[functionName] = async (...args) => {
                    return new Promise((resolve, reject) => {
                        _this.qbo[functionName](...args, async (err, data) => {
                            if (err) {
                                if (err.fault.type == 'AUTHENTICATION') {
                                    await _this.refreshTokenFunction();
                                    try {
                                        const result = await _this.__proto__[
                                            functionName
                                        ](...args);
                                        resolve(result);
                                    } catch (e) {
                                        reject(e);
                                    }
                                } else reject(err);
                            } else {
                                resolve(data);
                            }
                        });
                    });
                };
            }
        }
    }
}

class Api extends OAuth2Base {
    constructor(params) {
        params = params === undefined ? {} : params;
        // gets the authorization URI for QBO based on the permissions we need
        const authorizationUri = oauthClient.authorizeUri({
            scope: [
                OAuthClient.scopes.Accounting,
                // OAuthClient.scopes.OpenId,
                // OAuthClient.scopes.Email,
                // OAuthClient.scopes.Payment
            ],
            state: 'authorization',
        });

        params.key = oauthClient.clientId;
        params.secret = oauthClient.clientSecret;
        params.redirectUri = oauthClient.redirectUri;
        params.authorizationUri = authorizationUri;
        params.baseURL = process.env.QBO_BASE_URL;

        super(params);
        this.realmId = this.getParam(params, 'realmId', null);
        this.qbo = null;

        if (this.isAuthenticated()) {
            oauthClient.setToken({
                access_token: this.accessToken,
                refresh_token: this.refreshToken,
                realmId: this.realmId,
                expires_in: this.getExpireInSeconds(this.accessTokenExpire),
                x_refresh_token_expires_in: this.getExpireInSeconds(
                    this.refreshTokenExpire
                ),
            });
            this.updateQBOApiWrapper();
        }
    }

    updateQBOApiWrapper() {
        this.qbo = new QuickBooksPromise({
            key: this.key,
            secret: this.secret,
            accessToken: this.accessToken,
            realmId: this.realmId,
            environment: oauthClient.environment,
            refreshToken: this.refreshToken,
            refreshTokenFunction: this.refreshAccessToken.bind(this),
        });
    }

    async getTokens(redirectUrl) {
        const urlParams = new URLSearchParams(redirectUrl);
        this.realmId = this.getParam(urlParams, 'realmId');

        const response = await oauthClient.createToken(redirectUrl);
        await this.setTokens(response.getJson());
    }

    async notify(delegateString, object = null) {
        if (delegateString === 'TOKEN_UPDATE') {
            this.updateQBOApiWrapper();
        }

        await super.notify(delegateString, object);
    }

    //------------------------------------------------------------------------------
    //------------------------------------------------------------------------------
    // Logged in
    isAuthenticated() {
        return super.isAuthenticated() && this.realmId !== null;
    }

    shouldBeAuthenticated() {
        if (!this.isAuthenticated()) {
            throw new Error('Should be authenticated');
        }
    }

    async getAccessToken(code, realmId) {
        const response = await oauthClient.createToken(
            `test.com?${new URLSearchParams({ code, realmId }).toString()}`
        );
        this.realmId = realmId;
        await this.setTokens(response.getJson());
    }

    async refreshAccessToken() {
        this.shouldBeAuthenticated();

        // if(!oauthClient.isAccessTokenValid()) {
        try {
            const response = await oauthClient.refreshUsingToken(
                this.refreshToken
            );
            await this.setTokens(response.getJson());
        } finally {
            await this.notify(this.DLGT_TOKEN_DEAUTHORIZED);
        }
    }

    // Get Company Info from the API for the given Auth Token
    async getCompanyInfo() {
        this.shouldBeAuthenticated();
        const company = await this.qbo.getCompanyInfo(this.realmId);
        return company;
    }

    async getOrCreateCustomer(params) {
        const email = this.getParam(params, 'email');
        const firstName = this.getParam(params, 'firstName', null);
        const lastName = this.getParam(params, 'lastName', null);
        const phone = this.getParam(params, 'phone', null);

        this.shouldBeAuthenticated();

        const result = await this.qbo.findCustomers([
            { field: 'fetchAll', value: true },
            { field: 'PrimaryEmailAddr', value: email, operator: 'LIKE' },
        ]);

        if (
            result.QueryResponse.Customer &&
            result.QueryResponse.Customer.length > 0
        ) {
            return result.QueryResponse.Customer[0];
        }

        // create a new customer
        const customerObject = {
            PrimaryEmailAddr: {
                Address: email,
            },
            DisplayName: email,
        };

        firstName ? (customerObject.GivenName = firstName) : undefined;
        lastName ? (customerObject.FamilyName = lastName) : undefined;
        phone
            ? (customerObject.PrimaryPhone = { FreeFormNumber: phone })
            : undefined;

        return await this.qbo.createCustomer(customerObject);
    }

    async createInvoiceAndPayment(params) {
        this.shouldBeAuthenticated();
        const amount = this.getParam(params, 'amount');
        const email = this.getParam(params, 'email');

        const customer = await this.getOrCreateCustomer(params);

        // create the invoice
        // TODO we need to ask them what they want us to do by default
        const invoice = await this.qbo.createInvoice({
            Line: [
                {
                    DetailType: 'SalesItemLineDetail',
                    Amount: amount,
                    SalesItemLineDetail: {
                        ItemRef: {
                            name: 'Services',
                            value: '1',
                        },
                    },
                    // DueDate: moment().format("YYYY-MM-DD")
                },
            ],
            CustomerRef: {
                value: customer.Id,
            },
        });

        // create payment against the invoice
        const payment = await this.qbo.createPayment({
            TotalAmt: amount,
            CustomerRef: {
                value: customer.Id,
            },
        });

        // mark as paid
        payment.Line = [
            {
                Amount: amount,
                LinkedTxn: [
                    {
                        TxnId: invoice.Id,
                        TxnType: 'Invoice',
                    },
                ],
            },
        ];

        const updatedPayment = await this.qbo.updatePayment(payment);
        return updatedPayment;
    }
}

module.exports = Api;
