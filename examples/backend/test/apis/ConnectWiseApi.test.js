// require('../../setupEnv');
// const chai = require('chai');
// const ConnectWiseApi = require('../../src/modules/ConnectWise/Api.js');

// const { expect } = chai;
// const chaiAsPromised = require('chai-as-promised');
// chai.use(require('chai-url'));

// chai.use(chaiAsPromised);
// const moment = require('moment');

// describe.skip('ConnectWiseApi', async () => {
//     let api;
//     before(async () => {
//         api = new ConnectWiseApi({
//             company_id: process.env.CWISE_COMPANY_ID,
//             public_key: process.env.CWISE_PUBLIC_KEY,
//             secret_key: process.env.CWISE_SECRET_KEY,
//             site: process.env.CWISE_SITE,
//         });
//     });

//     describe('Companies', async () => {
//         let cwise_company;
//         let body;

//         before(async () => {
//             body = {
//                 identifier: `Bubblegum${moment().format('x')}`,
//                 name: 'New Company Test',
//                 site: {
//                     id: 1,
//                     name: 'Main',
//                 },
//                 status: {
//                     id: 1,
//                 },
//                 types: [
//                     {
//                         id: 5,
//                     },
//                 ],
//                 // "addressLine1": "20 Madbury"
//             };
//             const response = await api.createCompany(body);
//             expect(response.identifier).to.equal(body.identifier);
//             cwise_company = response;
//         });

//         after(async () => {
//             const response = await api.deleteCompanyById(cwise_company.id);
//             response.status.should.equal(204);
//         });

//         it('should list companies', async () => {
//             const response = await api.listCompanies();
//             expect(response[0].id).be.a('number');
//             expect(response[0].identifier).be.a('string');
//         });

//         it('should create a company', async () => {
//             expect(cwise_company.identifier).to.equal(body.identifier);
//         });

//         it('should get a company by ID', async () => {
//             const response = await api.getCompanyById(cwise_company.id);
//             expect(response.id).to.equal(cwise_company.id);
//             expect(response.identifier).to.equal(body.identifier);
//         });

//         it('should delete a company by ID', async () => {});

//         it('should patch update a company by ID', async () => {
//             const body = {
//                 name: 'New Name',
//             };
//             const response = await api.patchCompanyById(cwise_company.id, body);
//         });
//     });

//     describe('Callbacks', async () => {
//         let callback;

//         before(async () => {
//             const body = {
//                 id: 1,
//                 description: 'test',
//                 url: 'https://15b06d882429bcd.ngrok.io',
//                 objectId: 13,
//                 type: 'contact',
//                 level: '12',
//                 memberId: 176,
//                 payloadVersion: '3.0.0',
//                 inactiveFlag: false,
//                 isSoapCallbackFlag: false,
//                 isSelfSuppressedFlag: false,
//             };
//             const response = await api.createCallback(body);
//             expect(response.description).to.equal('test');
//             callback = response;
//         });

//         after(async () => {
//             const response = await api.deleteCallbackId(callback.id);
//         });

//         it('should list callbacks', async () => {
//             const response = await api.listCallbacks();
//             expect(response[0].id).be.a('number');
//             expect(response[0].objectId).be.a('number');
//             expect(response[0].description).be.a('string');
//         });

//         it('should create a callback', async () => {
//             expect(callback.description).to.equal('test');
//         });

//         it('should delete a callback by ID', async () => {});

//         it('should get a callback by ID', async () => {
//             const response = await api.getCallbackId(callback.id);
//             expect(response.id).to.equal(callback.id);
//             expect(response.memberId).to.equal(callback.memberId);
//             expect(response.description).to.equal(callback.description);
//         });
//     });

//     describe('Contacts', async () => {
//         let createdContact;
//         before(async () => {
//             const contact = {
//                 firstName: 'miguel',
//                 lastName: 'delgado',
//                 relationshipOverride: '',
//                 inactiveFlag: false,
//                 marriedFlag: false,
//                 childrenFlag: false,
//                 disablePortalLoginFlag: true,
//                 unsubscribeFlag: false,
//                 mobileGuid: 'b206022f-1d52-47d7-870a-d9bce3dff3cd',
//                 defaultBillingFlag: false,
//                 defaultFlag: false,
//                 types: [],
//             };
//             const response = await api.createContact(contact);
//             expect(response.firstName).to.equal('miguel');
//             expect(response.lastName).to.equal('delgado');
//             createdContact = response;
//         });

//         after(async () => {
//             const response = await api.deleteContact(createdContact.id);
//             expect(response.status).to.equal(204);
//         });

//         it('should list contacts', async () => {
//             const response = await api.lisContacts();
//             expect(response[0].id).be.a('number');
//             expect(response[0].disablePortalLoginFlag).be.a('boolean');
//             expect(response[0].lastName).be.a('string');
//         });

//         it('should get contact by ID', async () => {
//             const response = await api.getContactbyId(createdContact.id);
//             expect(response.id).to.equal(createdContact.id);
//         });

//         it('should create a contact', async () => {
//             expect(createdContact.firstName).to.equal('miguel');
//             expect(createdContact.lastName).to.equal('delgado');
//         });

//         it('should update contact', async () => {
//             const body = { lastName: 'Fernandez' };
//             const response = await api.updateContact(createdContact.id, body);
//             // response.status.should.equal(200);
//         });

//         it('should delete contact', async () => {});
//     });
// });
