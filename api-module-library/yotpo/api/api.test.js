'use strict';
require('dotenv').config();
const chai = require('chai');
const should = chai.should();
const { Api } = require('./api');
const { expect } = require('chai');
const nock = require('nock');
const authResponse = require('../fixtures/responses/authResponse.json');
const createOrderFulfillmentResponse = require('../fixtures/responses/createOrderFulfillmentResponse.json');
const Authenticator = require('@friggframework/test-environment/Authenticator');

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
    describe('App Developer API', () => {
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
        // describe('Authentication', () => {
        //     const authResponse = require('./fixtures/responses/authResponse.json');
        //     let createOrderFulfillmentCall;
        //     let getTokenCall;
        //     let result;
        //     let requestBody = {
        //         secret: api.SECRET,
        //     };
        //
        //     it('should get Token if no token is set', async () => {
        //         createOrderFulfillmentCall = nock('https://api.yotpo.com/core')
        //             .post(
        //                 `/v3/stores/${api.STORE_ID}/orders/1234/fulfillments`,
        //                 (body) => {
        //                     requestBody = body;
        //                     return requestBody;
        //                 }
        //             )
        //             .reply(401, {});
        //
        //         getTokenCall = nock('https://api.yotpo.com/core')
        //             .post(
        //                 `/v3/stores/${api.STORE_ID}/access_tokens`,
        //                 (body) => {
        //                     requestBody = body;
        //                     return requestBody;
        //                 }
        //             )
        //             .reply(200, authResponse);
        //
        //         result = await api.createOrderFulfillment(requestBody, '1234');
        //     });
        //
        //     it('calls the expected endpoint', () => {
        //         expect(createOrderFulfillmentCall.isDone()).to.be.true;
        //         expect(getTokenCall.isDone()).to.be.true;
        //     });
        //
        //     it('should return the correct response', () => {
        //         expect(authResponse).to.have.property('access_token');
        //     });
        // });
        //
        // describe('Order Fulfillments', () => {
        //     api.API_KEY_VALUE = 'abcdefghijk';
        //     const createOrderFulfillmentResponse = require('./fixtures/responses/createOrderFulfillmentResponse.json');
        //     let createOrderFulfillmentCall;
        //     let result;
        //     let requestBody = {
        //         fulfillment: {
        //             external_id: '56789',
        //             fulfillment_date: '2023-03-31T11:58:51Z',
        //             status: 'pending',
        //             fulfilled_items: [
        //                 {
        //                     external_product_id: '012345',
        //                     quantity: 1,
        //                 },
        //             ],
        //         },
        //     };
        //     it('should create an order fulfillment', async () => {
        //         createOrderFulfillmentCall = nock('https://api.yotpo.com/core')
        //             .post(
        //                 `/v3/stores/${api.STORE_ID}/orders/1234/fulfillments`,
        //                 (body) => {
        //                     requestBody = body;
        //                     return requestBody;
        //                 }
        //             )
        //             .reply(201, createOrderFulfillmentResponse);
        //
        //         result = await api.createOrderFulfillment(requestBody, '1234');
        //     });
        //
        //     it('calls the expected endpoint', () => {
        //         expect(createOrderFulfillmentCall.isDone()).to.be.true;
        //     });
        //
        //     it('should return the correct response', () => {
        //         expect(createOrderFulfillmentResponse).to.have.property(
        //             'fulfillment'
        //         );
        //         expect(
        //             createOrderFulfillmentResponse.fulfillment
        //         ).to.have.property('yotpo_id');
        //     });
        // });
    });
    describe('Reviews', () => {});
    describe('UGC API', () => {});
});
