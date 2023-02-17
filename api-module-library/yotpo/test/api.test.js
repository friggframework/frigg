'use strict';
require('dotenv').config();
const chai = require('chai');
const should = chai.should();
const { Api } = require('../api/api');
const { expect } = require('chai');
const nockBack = require('nock').back;
const authResponse = require('../fixtures/responses/authResponse.json');
const createOrderFulfillmentResponse = require('../fixtures/responses/createOrderFulfillmentResponse.json');
const Authenticator = require('@friggframework/test-environment/Authenticator');

const testCustomer = {
    email: process.env.TEST_CUSTOMER_EMAIL || 'test@example.com',
    first_name: process.env.TEST_CUSTOMER_FIRST_NAME || 'Tester',
    last_name: process.env.TEST_CUSTOMER_LAST_NAME || 'McTesterson',
};

const testOrder = {};
nockBack.fixtures = __dirname + '/fixtures/';

describe('Yotpo API class', () => {
    const api = new Api({
        secret: process.env.YOTPO_API_SECRET || 'secret',
        store_id: process.env.YOTPO_STORE_ID || 'vwxyz',
        client_id: process.env.YOTPO_CLIENT_ID || "big ol' client",
        client_secret: process.env.YOTPO_CLIENT_SECRET || 'whisper whisper',
        redirect_uri:
            process.env.REDIRECT_URI || 'http://localhost:3000/redirect/yotpo',
    });

    describe.skip('Core API', () => {
        describe('Authentication', () => {
            const authResponse = require('../fixtures/responses/authResponse.json');
            let createOrderFulfillmentCall;
            let getTokenCall;
            let result;
            let requestBody = {
                secret: api.SECRET,
            };

            it('should get Token if no token is set', async () => {
                const Authenticator = require('@friggframework/test-environment/Authenticator');

                createOrderFulfillmentCall = nock('https://api.yotpo.com/core')
                    .post(
                        `/v3/stores/${api.STORE_ID}/orders/1234/fulfillments`,
                        (body) => {
                            requestBody = body;
                            return requestBody;
                        }
                    )
                    .reply(401, {});

                getTokenCall = nock('https://api.yotpo.com/core')
                    .post(
                        `/v3/stores/${api.STORE_ID}/access_tokens`,
                        (body) => {
                            requestBody = body;
                            return requestBody;
                        }
                    )
                    .reply(200, authResponse);

                result = await api.createOrderFulfillment(requestBody, '1234');
            });

            it('calls the expected endpoint', () => {
                expect(createOrderFulfillmentCall.isDone()).to.be.true;
                expect(getTokenCall.isDone()).to.be.true;
            });

            it('should return the correct response', () => {
                expect(authResponse).to.have.property('access_token');
            });
        });

        describe('Order Fulfillments', () => {
            api.API_KEY_VALUE = 'abcdefghijk';
            const createOrderFulfillmentResponse = require('../fixtures/responses/createOrderFulfillmentResponse.json');
            let createOrderFulfillmentCall;
            let result;
            let requestBody = {
                fulfillment: {
                    external_id: '56789',
                    fulfillment_date: '2023-03-31T11:58:51Z',
                    status: 'pending',
                    fulfilled_items: [
                        {
                            external_product_id: '012345',
                            quantity: 1,
                        },
                    ],
                },
            };
            it('should create an order fulfillment', async () => {
                createOrderFulfillmentCall = nock('https://api.yotpo.com/core')
                    .post(
                        `/v3/stores/${api.STORE_ID}/orders/1234/fulfillments`,
                        (body) => {
                            requestBody = body;
                            return requestBody;
                        }
                    )
                    .reply(201, createOrderFulfillmentResponse);

                result = await api.createOrderFulfillment(requestBody, '1234');
            });

            it('calls the expected endpoint', () => {
                expect(createOrderFulfillmentCall.isDone()).to.be.true;
            });

            it('should return the correct response', () => {
                expect(createOrderFulfillmentResponse).to.have.property(
                    'fulfillment'
                );
                expect(
                    createOrderFulfillmentResponse.fulfillment
                ).to.have.property('yotpo_id');
            });
        });
    });
    describe.skip('App Developer API', () => {
        describe('Authentication', () => {
            const authResponse = require('../fixtures/responses/authResponse.json');

            it('should get Token if no token is set', async () => {
                const url = api.appDeveloperApi.authorizationUri;
                const response = await Authenticator.oauth2(url);
                const baseArr = response.base.split('/');
                response.entityType = baseArr[baseArr.length - 1];
                delete response.base;

                await api.appDeveloperApi.getTokenFromCode(
                    response.data.code,
                    response.data.app_key
                );
                expect(api.appDeveloperApi.access_token).to.exist;
            });

            it('calls the expected endpoint', () => {
                expect(api.appDeveloperApi.access_token).to.exist;
            });

            it('should return the correct response', () => {
                expect(authResponse).to.have.property('access_token');
            });
        });
    });
    describe('Loyalty API', () => {
        beforeAll(() => {
            api.loyaltyApi.setApiKey(process.env.YOTPO_LOYALTY_API_KEY);
            api.loyaltyApi.setGuid(process.env.YOTPO_LOYALTY_GUID);
        });
        describe('Authentication', () => {
            it('should succesfully make a GET request using the provided api key and guid', async () => {
                const res = await api.loyaltyApi.listActiveCampaigns();
                expect(res).to.be.an('array');
            });
        });

        describe('Customers', () => {
            it('Should list recent customers', async () => {
                const res = await api.loyaltyApi.listRecentCustomers();
                expect(res).to.be.an('object');
                expect(res).to.have.property('customers');
                expect(res.customers).to.be.an('array');
            });
            it('Should create a new customer with minimum required fields', async () => {
                const res = await api.loyaltyApi.createOrUpdateCustomer(
                    testCustomer
                );
                expect(res).to.be.an('object');
                await new Promise((resolve) => {
                    return setTimeout(resolve, 2000);
                });
                const recentUpdates =
                    await api.loyaltyApi.listRecentCustomers();
                expect(recentUpdates.customers).to.be.an('array');
                expect(recentUpdates.customers[0].first_name).to.equal(
                    testCustomer.first_name
                );
                expect(recentUpdates.customers[0].last_name).to.equal(
                    testCustomer.last_name
                );
            });
            it('Should update a customer with minimum required fields', async () => {
                const customerUpdate = {
                    ...testCustomer,
                    first_name: 'Updated',
                    last_name: 'Name',
                };
                const res = await api.loyaltyApi.createOrUpdateCustomer(
                    customerUpdate
                );
                expect(res).to.be.an('object');
                await new Promise((resolve) => {
                    return setTimeout(resolve, 2000);
                });
                const recentUpdates =
                    await api.loyaltyApi.listRecentCustomers();
                expect(recentUpdates.customers).to.be.an('array');
                expect(recentUpdates.customers[0].first_name).to.equal(
                    customerUpdate.first_name
                );
                expect(recentUpdates.customers[0].last_name).to.equal(
                    customerUpdate.last_name
                );
            });
        });
        describe('Campaigns', () => {
            it('Should list available active campaigns', async () => {
                const res = await api.loyaltyApi.listActiveCampaigns();
                expect(res).to.be.an('array');
            });
        });
        describe('Actions', () => {
            it('Should register a custom action for a given customer', async () => {
                const actionBody = {
                    type: 'CustomAction',
                    customer_email: testCustomer.email,
                    action_name: process.env.YOTPO_LOYALTY_TEST_ACTION_NAME,
                    created_at: '2023-02-03T18:50:39.183Z',
                };
                const res = await api.loyaltyApi.recordCustomerAction(
                    actionBody
                );
                expect(res).to.be.an('object');
            });
        });

        describe('Orders', () => {
            let requestBody = {
                customer_email: testCustomer.email,
                total_amount_cents: 1150,
                currency_code: 'USD',
                order_id: '84c904a1-02f5-459f-8e16-ca90a3833a12',
                status: 'paid',
                items: [
                    {
                        name: 'Example Product',
                        id: '',
                        quantity: 1,
                        type: 'example',
                    },
                ],
            };
            it('should create an order in Yotpo Loyalty', async () => {
                const result = await api.loyaltyApi.createOrder(requestBody);
            });
        });
    });
    describe('Reviews', () => {});
    describe('UGC API', () => {});
});
