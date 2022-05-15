const chai = require('chai');
const TestUtils = require('../../../../test/utils/TestUtils');

const should = chai.should();
const ApiClass = require('../api.js');

describe('Clyde Api Class Tests', async () => {
    const api = new ApiClass({
        clientKey: process.env.CLYDE_TEST_CLIENT_KEY,
        secret: process.env.CLYDE_TEST_SECRET,
        backOff: [1, 3, 10],
    });
    before('Test Auth', async () => {
        const products = await api.listProducts();
        products.data.should.be.an('array');
    });

    describe('Products', async () => {
        let product_1, product_2;
        before(async () => {
            // const body_1 = {
            //     name: 'Test Name',
            //     domain: 'TestDomain.com',
            // };
            // product_1 = await api.createProduct(body_1);
            // product_1.should.have.property('id');
            //
            // const body_2 = {
            //     name: 'Test Name2',
            //     domain: 'TestDomain2.com',
            // };
            // product_2 = await api.createProduct(body_2);
            // product_2.should.have.property('id');
        });

        after(async () => {
            // let deleted_1 = await api.archiveProduct(product_1.id);
            // let deleted_2 = await api.archiveProduct(product_2.id);
            // deleted_1.status.should.equal(204);
            // deleted_2.status.should.equal(204);
        });

        it('should list products', async () => {
            let res = await api.listProducts();
            res.data.should.be.an('array');
            res.data[0].should.have.property('id');
            res.data[0].should.have.property('attributes');
            res.data[0].should.have.property('type');
            res.data[0].attributes.should.have.property('name');
            res.data[0].attributes.should.have.property('type');
            res.data[0].attributes.should.have.property('sku');
            res.data[0].attributes.should.have.property('description');
            res.data[0].attributes.should.have.property('manufacturer');
            res.data[0].attributes.should.have.property('barcode');
            res.data[0].attributes.should.have.property('price');
            res.data[0].attributes.should.have.property('imageLink');
            res.data[0].attributes.should.have.property('contracts');
        });

        it('should create a product', async () => {
            //Hope the before happens
        });

        it('should get product by ID', async () => {
            // let res = await api.getProductById(product_1.id);
            // res.should.have.property('id');
        });

        it('should delete product', async () => {
            // Hope the after works!
        });
    });
    describe('Orders', async () => {
        let order_1, order_2;
        before(async () => {
            const body_1 = {
                data: {
                    type: 'order',
                    id: new Date(),
                    attributes: {
                        merchantReference1: '001',
                        merchantReference2: '002',
                        customer: {
                            firstName: 'Another',
                            lastName: 'Postman',
                            email: 'guy+postman@joinclyde.com',
                            phone: '212-217-0541',
                            address1: '579 Broadway',
                            address2: '2C',
                            city: 'New York',
                            province: 'NY',
                            zip: '10013',
                            country: 'US',
                            addressType: 'shipping',
                        },
                        contractSales: [],
                        lineItems: [
                            {
                                id: 'CUSTOMER_01',
                                productSku: 'HSG007',
                                price: 199.95,
                                quantity: 1,
                                serialNumber: '001',
                            },
                        ],
                    },
                },
            };
            order_1 = await api.createOrder(body_1);
            // product_1.should.have.property('id');
            //
            // const body_2 = {
            //     name: 'Test Name2',
            //     domain: 'TestDomain2.com',
            // };
            // product_2 = await api.createProduct(body_2);
            // product_2.should.have.property('id');
        });

        after(async () => {
            // let deleted_1 = await api.archiveProduct(product_1.id);
            // let deleted_2 = await api.archiveProduct(product_2.id);
            // deleted_1.status.should.equal(204);
            // deleted_2.status.should.equal(204);
        });

        it('should create an order', async () => {
            order_1.should.exist;
        });

        it.skip('should list orders', async () => {
            // TODO once API is ready
            let res = await api.listOrders();
            res.data.should.be.an('array');
            res.data[0].should.have.property('id');
            res.data[0].should.have.property('attributes');
            res.data[0].should.have.property('type');
            res.data[0].attributes.should.have.property('name');
            res.data[0].attributes.should.have.property('type');
            res.data[0].attributes.should.have.property('sku');
            res.data[0].attributes.should.have.property('description');
            res.data[0].attributes.should.have.property('manufacturer');
            res.data[0].attributes.should.have.property('barcode');
            res.data[0].attributes.should.have.property('price');
            res.data[0].attributes.should.have.property('imageLink');
            res.data[0].attributes.should.have.property('contracts');
        });

        it.skip('should create an order', async () => {
            //Hope the before happens
            order_1.should.have.property('id');
            order_2.should.have.property('id');
        });

        it('should get order by ID', async () => {
            let res = await api.getOrderById(order_1.data.id);
            res.data.should.have.property('id');
        });

        it('should fail to get order due to false ID', async () => {
            try {
                let res = await api.getOrderById(123);
                res.should.not.exist;
            } catch (e) {
                e.message.should.contain(
                    'No order matching the provided ID exists for this shop"'
                );
            }
        });

        it('should delete product', async () => {
            // Hope the after works!
        });
    });
});
