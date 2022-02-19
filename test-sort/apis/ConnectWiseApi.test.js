const moment = require('moment');
const ConnectWiseApi = require('../../src/modules/ConnectWise/Api.js');

describe.skip('ConnectWiseApi', () => {
    let api;
    beforeAll(async () => {
        api = new ConnectWiseApi({
            company_id: process.env.CWISE_COMPANY_ID,
            public_key: process.env.CWISE_PUBLIC_KEY,
            secret_key: process.env.CWISE_SECRET_KEY,
            site: process.env.CWISE_SITE,
        });
    });

    describe('Companies', () => {
        let cwise_company;
        let body;

        beforeAll(async () => {
            body = {
                identifier: `Bubblegum${moment().format('x')}`,
                name: 'New Company Test',
                site: {
                    id: 1,
                    name: 'Main',
                },
                status: {
                    id: 1,
                },
                types: [
                    {
                        id: 5,
                    },
                ],
                // "addressLine1": "20 Madbury"
            };
            const response = await api.createCompany(body);
            expect(response.identifier).toBe(body.identifier);
            cwise_company = response;
        });

        afterAll(async () => {
            const response = await api.deleteCompanyById(cwise_company.id);
            expect(response.status).toBe(204);
        });

        it('should list companies', async () => {
            const response = await api.listCompanies();
            expect(response[0].id).toBeInstanceOf(Number);
            expect(typeof response[0].identifier).toBe('string');
        });

        it('should create a company', async () => {
            expect(cwise_company.identifier).toBe(body.identifier);
        });

        it('should get a company by ID', async () => {
            const response = await api.getCompanyById(cwise_company.id);
            expect(response.id).toBe(cwise_company.id);
            expect(response.identifier).toBe(body.identifier);
        });

        it('should delete a company by ID', async () => {});

        it('should patch update a company by ID', async () => {
            const body = {
                name: 'New Name',
            };
            const response = await api.patchCompanyById(cwise_company.id, body);
        });
    });

    describe('Callbacks', () => {
        let callback;

        beforeAll(async () => {
            const body = {
                id: 1,
                description: 'test',
                url: 'https://15b06d882429bcd.ngrok.io',
                objectId: 13,
                type: 'contact',
                level: '12',
                memberId: 176,
                payloadVersion: '3.0.0',
                inactiveFlag: false,
                isSoapCallbackFlag: false,
                isSelfSuppressedFlag: false,
            };
            const response = await api.createCallback(body);
            expect(response.description).toBe('test');
            callback = response;
        });

        afterAll(async () => {
            const response = await api.deleteCallbackId(callback.id);
        });

        it('should list callbacks', async () => {
            const response = await api.listCallbacks();
            expect(response[0].id).toBeInstanceOf(Number);
            expect(response[0].objectId).toBeInstanceOf(Number);
            expect(typeof response[0].description).toBe('string');
        });

        it('should create a callback', async () => {
            expect(callback.description).toBe('test');
        });

        it('should delete a callback by ID', async () => {});

        it('should get a callback by ID', async () => {
            const response = await api.getCallbackId(callback.id);
            expect(response.id).toBe(callback.id);
            expect(response.memberId).toBe(callback.memberId);
            expect(response.description).toBe(callback.description);
        });
    });

    describe('Contacts', () => {
        let createdContact;
        beforeAll(async () => {
            const contact = {
                firstName: 'miguel',
                lastName: 'delgado',
                relationshipOverride: '',
                inactiveFlag: false,
                marriedFlag: false,
                childrenFlag: false,
                disablePortalLoginFlag: true,
                unsubscribeFlag: false,
                mobileGuid: 'b206022f-1d52-47d7-870a-d9bce3dff3cd',
                defaultBillingFlag: false,
                defaultFlag: false,
                types: [],
            };
            const response = await api.createContact(contact);
            expect(response.firstName).toBe('miguel');
            expect(response.lastName).toBe('delgado');
            createdContact = response;
        });

        afterAll(async () => {
            const response = await api.deleteContact(createdContact.id);
            expect(response.status).toBe(204);
        });

        it('should list contacts', async () => {
            const response = await api.lisContacts();
            expect(response[0].id).toBeInstanceOf(Number);
            expect(response[0].disablePortalLoginFlag).toBeInstanceOf(Boolean);
            expect(typeof response[0].lastName).toBe('string');
        });

        it('should get contact by ID', async () => {
            const response = await api.getContactbyId(createdContact.id);
            expect(response.id).toBe(createdContact.id);
        });

        it('should create a contact', async () => {
            expect(createdContact.firstName).toBe('miguel');
            expect(createdContact.lastName).toBe('delgado');
        });

        it('should update contact', async () => {
            const body = { lastName: 'Fernandez' };
            const response = await api.updateContact(createdContact.id, body);
            // response.status.should.equal(200);
        });

        it('should delete contact', async () => {});
    });
});
