const chai = require('chai');
const RevIoApi = require('../../src/modules/Rev.io/Api');

const { expect } = chai;
const chaiAsPromised = require('chai-as-promised');
chai.use(require('chai-url'));

chai.use(chaiAsPromised);

describe('RevIoApi', () => {
    const api = new RevIoApi({
        USER_NAME: process.env.REV_IO_USER_NAME,
        CLIENT_CODE: process.env.REV_IO_CLIENT_CODE,
        PASSWORD: process.env.REV_IO_PASSWORD,
    });

    xdescribe('createWebHookReciber', () => {
        it('should create a webhook reciber', async () => {
            const response = await api.createWebHookReciber(
                'https://79892db59771.ngrok.io',
                'Test 2',
                228097,
                false
            );
            expect(response.ok).be.true;
            expect(response.id).be.a('number');
        });
    });

    xdescribe('activateWebHookReciber', () => {
        it('should activate a webhook reciber', async () => {
            const response = await api.activateWebHookReciber(54);
            expect(response.ok).be.true;
        });
    });

    xdescribe('deleteWebHookReciber', () => {
        it('should delete a webhook reciber', async () => {
            const response = await api.deleteWebHookReciber(55);
            expect(response.ok).be.true;
        });
    });

    xdescribe('createWebhookSuscription', () => {
        it('should create a webhook suscription', async () => {
            const response = await api.createWebhookSuscription(
                'INVENTORY_UNASSIGNED',
                56
            );
            expect(response.ok).be.true;
            expect(response.id).be.a('number');
        });
    });

    xdescribe('getWebhookSuscription', () => {
        it('should get a webhook suscription', async () => {
            const response = await api.getWebhookSuscription(38);
            expect(response.ok).be.true;
            expect(response.webhook_subscription_id).be.a('number');
            expect(response.webhook_receiver_id).be.a('number');
            expect(response.event_type).to.equal('INVENTORY_UNASSIGNED');
        });
    });

    xdescribe('deleteWebhookSuscription', () => {
        it('should delete a webhook suscription', async () => {
            const response = await api.deleteWebhookSuscription(38);
            expect(response.ok).be.true;
        });
    });

    xdescribe('createCustomer', () => {
        it('should create a customer', async () => {
            const response = await api.createCustomer({
                billing_address: {
                    first_name: 'Miguel',
                    middle_initial: 'Delgado',
                    last_name: 'Fernandez',
                    company_name: 'Golabs',
                    line_1: '100mts oeste y',
                    line_2: '50 norte de la escuela',
                    city: 'Cerrro cortez',
                    state_or_province: 'alajuela',
                    postal_code: '21004',
                    postal_code_extension: '21004',
                    country_code: 'CRI',
                    created_date: '2020-08-02',
                },
                service_address: {
                    first_name: 'Miguel',
                    middle_initial: 'Delgado',
                    last_name: 'Fernandez',
                    company_name: 'Golabs',
                    line_1: '1000 mts oeste',
                    line_2: 'y 50 norte',
                    city: 'Cerro cortez',
                    state_or_province: 'Alajuela',
                    postal_code: '21004',
                    postal_code_extension: '21004',
                    country_code: 'CRI',
                    created_date: '2020-08-02',
                },
                finance: { bill_profile_id: 1000 },
                listing_address: {
                    first_name: 'Miguel',
                    middle_initial: 'Delgado',
                    last_name: 'Fernandez',
                    company_name: 'Golabs',
                    line_1: '100mts oeste ',
                    line_2: 'y 50 norte',
                    city: 'Cerro cortez',
                    state_or_province: 'Alajuela',
                    postal_code: '21004',
                    postal_code_extension: '21004',
                    country_code: 'CRI',
                    created_date: '2020-08-02',
                },
                fields: [{ field_id: 1, label: 'type', value: 'lefthook' }],
                account_number: '123',
                activated_date: '2020-08-02',
                close_date: '2020-08-02',
                email: 'jose.delgado@golabstech.com',
                is_parent: true,
                security_pin: '12345',
                source: 'web',
                status: 'PROSPECT',
                suspended: false,
            });
            // expect(response.ok).be.true;
        });
    });

    xdescribe('createContact', () => {
        it('should delete a webhook suscription', async () => {
            const response = await api.createContact({
                address: {
                    line_1: '100 mts de la escuela',
                    line_2: 'y 50 norte',
                    city: 'Cerro cortez',
                    state_or_province: 'alajuela',
                    postal_code: '21004',
                    postal_code_extension: '21004',
                },
                customer_id: '864631',
                name: 'Miguel',
                email: 'jose.delgado@golabstech.com',
                company: 'golabs',
                created_date: '2020-08-02',
                title: 'developer',
                fax: '24747012',
                phone: '84043571',
                comments: 'test',
                mobile: '84043571',
            });
            // expect(response.ok).be.true;
        });
    });

    describe('getContacts', () => {
        it.skip('should get the list of Contacts', async () => {
            const response = await api.getcontacts(38);
            expect(response.ok).be.true;
        });
    });

    describe('deleteContact', () => {
        it.skip('should delete a Contact', async () => {
            const response = await api.deleteContact(38);
            expect(response.ok).be.true;
        });
    });
});
