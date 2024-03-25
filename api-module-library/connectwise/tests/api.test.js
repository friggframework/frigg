require('dotenv').config();
const { Api } = require('../api');

describe('Connectwise API Tests', () => {
    /* eslint-disable camelcase */
    const apiParams = {
        public_key: process.env.CONNECTWISE_PUBLIC_KEY,
        private_key: process.env.CONNECTWISE_PRIVATE_KEY,
        company_id: process.env.CONNECTWISE_COMPANY_ID,
        client_id: process.env.CONNECTWISE_CLIENT_ID,
        site: process.env.CONNECTWISE_SITE,
    };
    /* eslint-enable camelcase */

    const api = new Api(apiParams);

    //Disabling auth flow for speed (access tokens expire after ten years)
    describe('Test Auth', () => {
        it('Should retrieve account status', async () => {
            const results = await api.listCallbacks();
            expect(results).toHaveProperty('length');
        });
    });


    describe('Company Requests', () => {
        it('Should retrieve companies', async () => {
            const companies = await api.listCompanies();
            expect(companies).toBeDefined();
            expect(companies).toHaveProperty('length');
        });
    });

    describe('Contact Requests', () => {
        it('Should retrieve contacts', async () => {
            const contacts = await api.listContacts();
            expect(contacts).toBeDefined();
            expect(contacts).toHaveProperty('length');
        });
        let createdContact;
        it('Should create a contact', async () => {
            const contact = {
                firstName: 'John',
                lastName: 'Doe',
            };
            createdContact = await api.createContact(contact);
            expect(createdContact).toHaveProperty('id');
        })
        it('Should retrieve created contact', async () => {
            const contact = await api.getContact(createdContact.id);
            expect(contact).toHaveProperty('id');
            expect(contact).toHaveProperty('firstName');
            expect(contact).toHaveProperty('lastName');
        });
        it('Should update created contact', async () => {
            const contact = {
                firstName: 'Jane',
                lastName: 'Doe',
            };
            const updatedContact = await api.updateContact(createdContact.id, contact);
            expect(updatedContact).toHaveProperty('id');
            expect(updatedContact).toHaveProperty('firstName');
            expect(updatedContact).toHaveProperty('lastName');
        })
        it('Should delete created contact', async () => {
            const response = await api.deleteContact(createdContact.id);
            expect(response.status).toBe(204)
        })
    })
});
