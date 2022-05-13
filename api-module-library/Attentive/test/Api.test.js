const chai = require('chai');
const TestUtils = require('../../../../test/utils/TestUtils');
const moment = require('moment');

const should = chai.should();

const Authenticator = require('../../../../test/utils/Authenticator');
const ApiClass = require('../Api.js');

describe('Attentive Api Class Tests', async () => {
    const api = new ApiClass({ backOff: [1, 3, 10] });
    before(async () => {
        const url = api.authorizationUri;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const token = await api.getTokenFromCode(response.data.code);
    });

    describe('User Info', async () => {
        it('should get user info', async () => {
            const response = await api.getTokenIdentity();
            response.should.have.property('applicationName');
            response.should.have.property('attentiveDomainName');
            response.should.have.property('companyName');
            response.should.have.property('contactEmail');
            response.should.have.property('companyId');
        });
    });

    describe('Subscriptions', async () => {
        let subscription;
        let body;

        beforeEach(async () => {
            body = {
                user: {
                    phone: '+17702980791',
                    email: 'test@gmail.com',
                },
                signUpSourceId: '149451',
            };
            subscription = await api.subscribeUser(body);
        });

        afterEach(async () => {
            subscription = body = {};
        });

        it('should subscribe a user', async () => {
            subscription.should.have.property('user');
            subscription.should.have.property('subscriptionResponses');
            subscription.user.phone.should.equal(body.user.phone);
            subscription.user.email.should.equal(body.user.email);
        });
        it('should get user subscriptions', async () => {
            const response = await api.getUserSubsciptions(body.user);
            response.should.have.property('subscriptionEligibilities');
            response.should.have.nested.property(
                'subscriptionEligibilities[0].eligibility.isEligible'
            );
        });
        it('should unsubscribe a user', async () => {
            const subscriptionsData = [
                {
                    type: 'MARKETING',
                    channel: 'TEXT',
                },
            ];
            const response = await api.unsubscribeUser({
                user: body.user,
                subscriptions: subscriptionsData,
            });
            response.should.have.property('subscriptionResponses');
        });
    });

    describe('Catalog Uploads', async () => {
        let upload;
        let body;

        beforeEach(async () => {
            body = {
                name: 'Nasa T-Shirt',
                id: 'PD-123',
                link: 'https://www.google.com',
                variants: [
                    {
                        name: 'Nasa T-Shirt - Black - Small',
                        id: 'VD-234',
                        prices: [
                            {
                                currencyCode: 'USD',
                                amount: '10.00',
                            },
                        ],
                        availableForPurchase: true,
                        productOptionValues: [
                            {
                                productOptionName: 'Color',
                                value: 'Black',
                            },
                            {
                                productOptionName: 'Size',
                                value: 'Medium',
                            },
                        ],
                    },
                ],
            };
            // Upload from URL
            upload = {
                uploadId: 1,
                status: 'completed',
                productsReceived: 0,
                productsProcessed: 0,
                validateOnly: true,
            };
        });

        afterEach(async () => {
            upload = body = {};
        });

        it('should create a catalog upload', async () => {
            // Test Upload after Upload template added to account and Upload URL specified
        });
        it('should get recent catalog uploads', async () => {
            // Access denied until Upload template is added to account
            // const response = await api.getCatalogUploads();
            // response.should.be.an('array');
            // response.should.have.nested.property('[0].uploadId');
        });
        it('should get a catalog upload by ID', async () => {
            // Access denied until Upload template is added to account
            // const catalogUploads = await api.getCatalogUploads();
            // const response = await api.getCatalogUploadById(catalogUploads[0].uploadId);
        });
    });

    describe('Events', async () => {
        let body;

        beforeEach(async () => {
            body = {
                items: [
                    {
                        productId: 'AB12345',
                        productVariantId: 'CD12345',
                        price: [
                            {
                                value: 10,
                                currency: 'USD',
                            },
                        ],
                    },
                ],
                occuredAt: moment().toISOString(),
                user: {
                    phone: '+1770298791',
                    email: 'test@gmail.com',
                },
            };
        });

        afterEach(async () => {
            body = {};
        });

        it('should trigger a product view event', async () => {
            console.log(
                'Failing because Attentive API responding with no or malformed response?'
            );
            console.log(
                'Debug at LHRequester.parsedBody to handle no response?'
            );
            const response = await api.createProductViewEvent(body);
        });
        it('should trigger an add to cart event', async () => {
            const response = await api.createAddToCartEvent(body);
        });
        it('should trigger a purchase event', async () => {
            const response = await api.createPurchaseEvent(body);
        });
    });
    describe('Custom Events', async () => {
        it('should trigger a custom event', async () => {
            const body = {
                type: 'Order Shipped',
                occurredAt: moment().toISOString(),
                user: {
                    phone: '+17702980791',
                    email: 'test@gmail.com',
                },
            };
            const response = await api.createCustomEvent(body);
        });
    });
});
