/* eslint-disable no-only-tests/no-only-tests */
const chai = require('chai');
const TestUtils = require('../../../../test/utils/TestUtils');
const { debug } = require('../../../utils/logger');
const moment = require('moment');
const path = require('path');

const should = chai.should();

const Authenticator = require('../../../../test/utils/Authenticator');
const ApiClass = require('../api.js');
const Handlebars = require('handlebars');

describe('Gorgias API Requests', async () => {
    const api = new ApiClass({
        backOff: [1, 3, 10],
    });
    before(async () => {
        let url = api.authorizationUri;
        // if there's curly braces in the url, then we need to merge
        const decodedUrl = decodeURI(url);
        const subdomain = process.env.GORGIAS_TEST_SUBDOMAIN;
        const template = Handlebars.compile(decodedUrl);
        url = template({ subdomain });
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        api.setSubdomain(subdomain);
        const token = await api.getTokenFromCodeBasicAuthHeader(
            response.data.code
        );
    });

    it('should grab account details', async () => {
        const response = await api.getAccountDetails();
        debug(response);
    });

    describe('Gorgias Tickets', async () => {
        let ticket;
        before(async () => {
            const body = {
                messages: [
                    {
                        body_text: 'Testing testing 123',
                        channel: 'email',
                        from_agent: true,
                        via: 'api',
                    },
                ],
            };
            ticket = await api.createTicket(body);
            ticket.should.have.property('id');
        });

        after(async () => {
            const deletedTicket = await api.deleteTicket(ticket.id);
            deletedTicket.status.should.equal(204);
        });

        it('should create a ticket', async () => {
            // Hope the before works
        });

        it('should delete a ticket', async () => {
            // Hope the after works
        });

        it('should get a ticket by ID', async () => {
            const res = await api.getTicketById(ticket.id);
            res.should.have.property('id');
            res.id.should.equal(ticket.id);
        });

        it('should list tickets', async () => {
            const res = await api.listTickets();
            res.should.be.an('array');
            res[0].should.have.property('id');
        });

        it('should update ticket', async () => {
            const body = {
                messages: [
                    {
                        body_text: 'Oops! Wrong email...',
                        channel: 'email',
                        from_agent: true,
                        via: 'api',
                    },
                ],
            };
            ticket = await api.updateTicket(ticket.id, body);
            ticket.should.have.property('id');
        });
    });

    describe('Gorgias Customers', async () => {
        let customer;
        before(async () => {
            const body = {
                channels: [
                    {
                        type: 'email',
                        address: 'testor.testaber@test.com',
                        preferred: true,
                    },
                ],
                email: 'testor.testaber@test.com',
                name: 'Testor Testaber',
            };
            customer = await api.createCustomer(body);
            customer.should.have.property('id');
        });

        after(async () => {
            const deletedCustomer = await api.deleteCustomer(customer.id);
            deletedCustomer.status.should.equal(204);
        });

        it('should create a customer', async () => {
            // Hope the before works
        });

        it('should delete a customer', async () => {
            // Hope the after works
        });

        it('should get a customer by ID', async () => {
            const res = await api.getCustomerById(customer.id);
            res.should.have.property('id');
            res.id.should.equal(customer.id);
        });

        it('should list customers', async () => {
            const res = await api.listCustomers();
            res.should.be.an('array');
            res[0].should.have.property('id');
        });

        it('should update customer', async () => {
            const body = {
                channels: [
                    {
                        type: 'email',
                        address: 'testor.testaber@test.com',
                        preferred: true,
                    },
                ],
                email: 'testor.testaber@test.com',
                name: 'Testor Testaburger',
            };
            customer = await api.updateCustomer(customer.id, body);
            customer.should.have.property('id');
        });
    });

    describe('Gorgias Integrations', async () => {
        let integration;
        before(async () => {
            const body = {
                name: 'Unit Test Integration',
                type: 'http',
                http: {
                    url: 'https://lefthook.com',
                },
            };
            integration = await api.createIntegration(body);
            integration.should.have.property('id');
        });

        after(async () => {
            const deletedIntegration = await api.deleteIntegration(
                integration.id
            );
            deletedIntegration.status.should.equal(204);
        });

        it('should create a integration', async () => {
            // Hope the before works
        });

        it('should delete a integration', async () => {
            // Hope the after works
        });

        it('should get a integration by ID', async () => {
            const res = await api.getIntegrationById(integration.id);
            res.should.have.property('id');
            res.id.should.equal(integration.id);
        });

        it('should list integration', async () => {
            const res = await api.listIntegrations();
            res.data.should.be.an('array');
            res[0].should.have.property('id');
        });

        it('should update integration', async () => {
            const body = {
                name: 'Unit Test Integration Updated',
                type: 'http',
                http: {
                    url: 'https://lefthook.com',
                },
            };
            integration = await api.updateIntegration(integration.id, body);
            integration.should.have.property('id');
        });
    });

    describe('Gorgias Widgets', async () => {
        let widget;
        let logoUrl;
        before(async () => {
            const body = {
                template: {
                    type: 'wrapper',
                    widgets: [
                        {
                            type: 'card',
                            title: 'Frigg Example Widget',
                            widgets: [
                                {
                                    meta: {
                                        limit: '',
                                        orderBy: '',
                                    },
                                    path: 'data',
                                    type: 'list',
                                    widgets: [
                                        {
                                            meta: {
                                                link: '',
                                                displayCard: true,
                                            },
                                            type: 'card',
                                            title: 'Pretend',
                                            widgets: [
                                                {
                                                    path: 'id',
                                                    type: 'text',
                                                    title: 'Order ID',
                                                },
                                                {
                                                    meta: {
                                                        link: '',
                                                        displayCard: true,
                                                    },
                                                    path: 'attributes',
                                                    type: 'card',
                                                    title: 'Order Details',
                                                    widgets: [
                                                        {
                                                            path: 'merchantReference1',
                                                            type: 'text',
                                                            title: 'Merchant reference1',
                                                        },
                                                        {
                                                            path: 'merchantReference2',
                                                            type: 'text',
                                                            title: 'Merchant reference2',
                                                        },
                                                        {
                                                            path: 'orderDate',
                                                            type: 'date',
                                                            title: 'Order date',
                                                        },
                                                        {
                                                            path: 'orderSource',
                                                            type: 'text',
                                                            title: 'Order source',
                                                        },
                                                        {
                                                            path: 'postPurchase',
                                                            type: 'card',
                                                            title: 'Post purchase',
                                                            widgets: [
                                                                {
                                                                    path: 'daysLeft',
                                                                    type: 'text',
                                                                    title: 'Days left',
                                                                },
                                                                {
                                                                    path: 'eligible',
                                                                    type: 'boolean',
                                                                    title: 'Eligible',
                                                                },
                                                                {
                                                                    path: 'link',
                                                                    type: 'url',
                                                                    title: 'Link',
                                                                },
                                                                {
                                                                    path: 'waitingFor',
                                                                    type: 'text',
                                                                    title: 'Waiting for',
                                                                },
                                                            ],
                                                        },
                                                        {
                                                            path: 'contractSales',
                                                            type: 'list',
                                                            widgets: [
                                                                {
                                                                    type: 'card',
                                                                    title: 'Contract Sales',
                                                                    widgets: [
                                                                        {
                                                                            path: 'cancelled',
                                                                            type: 'boolean',
                                                                            title: 'Cancelled',
                                                                        },
                                                                        {
                                                                            path: 'contractPrice',
                                                                            type: 'text',
                                                                            title: 'Contract price',
                                                                        },
                                                                        {
                                                                            path: 'contractSku',
                                                                            type: 'text',
                                                                            title: 'Contract sku',
                                                                        },
                                                                        {
                                                                            path: 'createdAt',
                                                                            type: 'text',
                                                                            title: 'Created at',
                                                                        },
                                                                        {
                                                                            path: 'externalId',
                                                                            type: 'text',
                                                                            title: 'External id',
                                                                        },
                                                                        {
                                                                            path: 'id',
                                                                            type: 'text',
                                                                            title: 'Id',
                                                                        },
                                                                        {
                                                                            path: 'lineItemId',
                                                                            type: 'text',
                                                                            title: 'Line item id',
                                                                        },
                                                                        {
                                                                            path: 'productPrice',
                                                                            type: 'text',
                                                                            title: 'Product price',
                                                                        },
                                                                        {
                                                                            path: 'productSku',
                                                                            type: 'text',
                                                                            title: 'Product sku',
                                                                        },
                                                                        {
                                                                            path: 'serialNumber',
                                                                            type: 'text',
                                                                            title: 'Serial number',
                                                                        },
                                                                    ],
                                                                    meta: {
                                                                        link: '',
                                                                        displayCard: true,
                                                                    },
                                                                },
                                                            ],
                                                            meta: {
                                                                limit: '',
                                                                orderBy: '',
                                                            },
                                                        },
                                                        {
                                                            path: 'lineItems',
                                                            type: 'list',
                                                            widgets: [
                                                                {
                                                                    type: 'card',
                                                                    title: 'Line Items',
                                                                    widgets: [
                                                                        {
                                                                            path: 'id',
                                                                            type: 'text',
                                                                            title: 'Id',
                                                                        },
                                                                        {
                                                                            path: 'price',
                                                                            type: 'text',
                                                                            title: 'Price',
                                                                        },
                                                                        {
                                                                            path: 'productSku',
                                                                            type: 'text',
                                                                            title: 'Product sku',
                                                                        },
                                                                        {
                                                                            path: 'quantity',
                                                                            type: 'text',
                                                                            title: 'Quantity',
                                                                        },
                                                                        {
                                                                            path: 'refundedQuantity',
                                                                            type: 'text',
                                                                            title: 'Refunded quantity',
                                                                        },
                                                                        {
                                                                            path: 'serialNumber',
                                                                            type: 'array',
                                                                            title: 'Serial number',
                                                                        },
                                                                        {
                                                                            path: 'shipDate',
                                                                            type: 'date',
                                                                            title: 'Ship date',
                                                                        },
                                                                        {
                                                                            path: 'eventHistory',
                                                                            type: 'list',
                                                                            widgets:
                                                                                [
                                                                                    {
                                                                                        type: 'card',
                                                                                        title: 'Event history',
                                                                                        widgets:
                                                                                            [
                                                                                                {
                                                                                                    path: 'eventDate',
                                                                                                    type: 'text',
                                                                                                    title: 'Event date',
                                                                                                },
                                                                                                {
                                                                                                    path: 'eventType',
                                                                                                    type: 'text',
                                                                                                    title: 'Event type',
                                                                                                },
                                                                                                {
                                                                                                    path: 'quantity',
                                                                                                    type: 'text',
                                                                                                    title: 'Quantity',
                                                                                                },
                                                                                            ],
                                                                                    },
                                                                                ],
                                                                        },
                                                                    ],
                                                                    meta: {
                                                                        link: '',
                                                                        displayCard: true,
                                                                    },
                                                                },
                                                            ],
                                                            meta: {
                                                                limit: '',
                                                                orderBy: '',
                                                            },
                                                        },
                                                    ],
                                                },
                                            ],
                                            path: 'orders',
                                        },
                                    ],
                                },
                            ],
                            path: '',
                        },
                    ],
                    meta: {
                        color: '#000000',
                    },
                },
                context: 'ticket',
                type: 'http',
            };
            widget = await api.createWidget(body);
            widget.should.have.property('id');
        });

        after(async () => {
            const deletedWidget = await api.deleteWidget(widget.id);
            deletedWidget.status.should.equal(204);
        });

        it('should create a widget', async () => {
            // Hope the before works
        });

        it('should delete a widget', async () => {
            // Hope the after works
        });

        it('should get a widget by ID', async () => {
            const res = await api.getWidgetById(widget.id);
            res.should.have.property('id');
            res.id.should.equal(widget.id);
        });

        it('should upload an image for widget logo', async () => {
            const absolutePath = path.resolve(__dirname, './logotest.png');
            const res = await api.uploadWidgetIcon({
                filePath: absolutePath,
            });
            logoUrl = res[0].url;
            res[0].should.have.property('url');
            res[0].name.should.contain('widget');
        });

        it('should list widget', async () => {
            const res = await api.listWidgets();
            res.data.should.be.an('array');
            res[0].should.have.property('id');
        });

        it('should update widget', async () => {
            const body = {
                context: 'ticket',
                template: {
                    type: 'wrapper',
                    widgets: [
                        {
                            meta: {
                                link: '',
                                displayCard: true,
                                pictureUrl: logoUrl,
                                color: '',
                            },
                            title: 'Frigg Example Update',
                            type: 'card',
                            path: '',
                        },
                    ],
                },
                type: 'http',
            };
            widget = await api.updateWidget(widget.id, body);
            widget.should.have.property('id');
        });
    });
});
