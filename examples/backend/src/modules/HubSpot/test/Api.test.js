const chai = require('chai');
const TestUtils = require('../../../../test/utils/TestUtils');

const should = chai.should();

const Authenticator = require('../../../../test/utils/Authenticator');
const ApiClass = require('../Api.js');

describe.skip('HubSpot Api Class Tests', async () => {
    const api = new ApiClass({ backOff: [1, 3, 10] });
    before(async () => {
        const url = api.authorizationUri;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const token = await api.getTokenFromCode(response.data.code);
    });

    describe('Companies', async () => {
        let company_1, company_2;
        before(async () => {
            const body_1 = {
                name: 'Test Name',
                domain: 'TestDomain.com',
            };
            company_1 = await api.createCompany(body_1);
            company_1.should.have.property('id');

            const body_2 = {
                name: 'Test Name2',
                domain: 'TestDomain2.com',
            };
            company_2 = await api.createCompany(body_2);
            company_2.should.have.property('id');
        });

        after(async () => {
            let deleted_1 = await api.archiveCompany(company_1.id);
            let deleted_2 = await api.archiveCompany(company_2.id);
            deleted_1.status.should.equal(204);
            deleted_2.status.should.equal(204);
        });

        it('should create a company', async () => {
            //Hope the before happens
        });

        it('should get company properties', async () => {
            let res = await api.getProperties('company');
            res.should.have.property('results');
            res.results.should.be.an('array');
        });

        it('should get company by ID', async () => {
            let res = await api.getCompanyById(company_1.id);
            res.should.have.property('id');
        });

        it('should batch get companies by ID', async () => {
            // //get properties first
            // let properties = await api.getProperties('Company');
            // let propertyStrings = properties.results.map((prop) => {
            //     return prop.name;
            // });

            let params = {
                inputs: [
                    { id: parseInt(company_1.id) },
                    { id: parseInt(company_2.id) },
                ],
                properties: ['domain'],
            };
            let res = await api.batchGetCompaniesById(params);
            res.results.should.be.an('array');
            res.results[0].should.have.property('id');
            res.results[0].should.have.property('properties');
            res.results[0].should.have.property('createdAt');
            res.results[0].should.have.property('updatedAt');
            res.results[0].should.have.property('archived');
        });

        it('should delete company', async () => {
            // Hope the after works!
        });
    });

    describe('Contacts', async () => {
        let contact_1, contact_2;
        before(async () => {
            const body_1 = {
                email: 'testor.testaber@hubspot.com',
                firstname: 'Testor',
                lastname: 'Testaber',
            };
            contact_1 = await api.createContact(body_1);
            contact_1.should.have.property('id');
            contact_1.should.have.property('properties');
            contact_1.should.have.property('createdAt');
            contact_1.should.have.property('updatedAt');
            contact_1.should.have.property('archived');

            const body_2 = {
                email: 'Test.McTest@test.com',
                firstname: 'Test',
                lastname: 'McTest',
            };
            contact_2 = await api.createContact(body_2);
            contact_2.should.have.property('id');
            contact_2.should.have.property('properties');
            contact_2.should.have.property('createdAt');
            contact_2.should.have.property('updatedAt');
            contact_2.should.have.property('archived');
        });

        after(async () => {
            let deleted_1 = await api.archiveContact(contact_1.id);
            let deleted_2 = await api.archiveContact(contact_2.id);
            deleted_1.status.should.equal(204);
            deleted_2.status.should.equal(204);
        });

        it('should create a contact', async () => {
            //Hope the before happens
        });

        it('should delete a contact', async () => {
            //Hope the after works
        });

        it('should get contact properties', async () => {
            let res = await api.getProperties('contact');
            res.should.have.property('results');
            res.results.should.be.an('array');
        });

        it('should list contacts', async () => {
            let res = await api.listContacts();
            res.should.have.property('results');
            res.results.should.be.an('array');
        });

        it('should get contact by ID', async () => {
            let res = await api.getContactById(contact_1.id);
            res.should.have.property('id');
        });

        it('should batch get contacts by IDs', async () => {
            let params = {
                inputs: [
                    { id: parseInt(contact_1.id) },
                    { id: parseInt(contact_2.id) },
                ],
                properties: ['email', 'firstname', 'lastname'],
            };
            let res = await api.batchGetContactsById(params);
            res.results.should.be.an('array');
            res.results[0].should.have.property('id');
            res.results[0].should.have.property('properties');
            res.results[0].should.have.property('createdAt');
            res.results[0].should.have.property('updatedAt');
            res.results[0].should.have.property('archived');
        });
    });

    describe('V1 Contact Lists', async () => {
        let list;
        before(async () => {
            const body = {
                name: 'Test List',
            };
            list = await api.createContactList(body);
            list.should.have.property('name');
            list.should.have.property('internalListId');
            list.should.have.property('listId');
            list.should.have.property('portalId');
            list.should.have.property('metaData');
            list.should.have.property('updatedAt');
            list.should.have.property('createdAt');
        });

        after(async () => {
            let deleted_1 = await api.deleteContactList(list.internalListId);
            deleted_1.status.should.equal(204);
        });

        it('should create a list', async () => {
            //Hope the before happens
        });

        it('should delete a list', async () => {
            //Hope the after works
        });

        it('should get list by ID', async () => {
            let res = await api.getContactListById(list.internalListId);
            res.should.have.property('portalId');
            res.should.have.property('listId');
            res.should.have.property('name');
            res.should.have.property('createdAt');
            res.should.have.property('updatedAt');
        });

        it('should list contact lists', async () => {
            let res = await api.listContactLists();
            res.should.have.property('offset');
            res.should.have.property('lists');
            res.should.have.property('has-more');
        });

        it('should update a list', async () => {
            let body = {
                name: 'Updated test name',
            };
            let res = await api.updateContactList(list.internalListId, body);
        });
    });

    describe('Deals', async () => {
        let deal, secondDeal, nextPage;
        before(async () => {
            const body = {
                amount: '1234.00',
                dealname: 'Unit test deal',
                dealstage: 'presentationscheduled',
            };
            deal = await api.createDeal(body);
            deal.should.have.property('id');
            deal.should.have.property('properties');
            deal.should.have.property('createdAt');
            deal.should.have.property('updatedAt');
            deal.should.have.property('archived');

            body.amount = '12345.00';
            body.dealname = 'Second Unit test deal';
            secondDeal = await api.createDeal(body);
            secondDeal.should.have.property('id');
            secondDeal.should.have.property('properties');
            secondDeal.should.have.property('createdAt');
            secondDeal.should.have.property('updatedAt');
            secondDeal.should.have.property('archived');
        });

        after(async () => {
            const deleted = await api.archiveDeal(deal.id);
            deleted.status.should.equal(204);
            const secondDeleted = await api.archiveDeal(secondDeal.id);
            secondDeleted.status.should.equal(204);
        });

        it('should create a deal', async () => {
            //Hope the before happens
        });

        it('should delete a deal', async () => {
            //Hope the after works
        });

        it('should get deal properties', async () => {
            let res = await api.getProperties('deal');
            res.should.have.property('results');
            res.results.should.be.an('array');
        });

        it('should get deal by ID', async () => {
            let res = await api.getDealById(deal.id);
            res.should.have.property('id');
            res.should.have.property('properties');
            res.should.have.property('createdAt');
            res.should.have.property('updatedAt');
            res.should.have.property('archived');
        });

        it('should update a deal', async () => {
            let properties = {
                amount: '1245.00',
            };
            let res = await api.updateDeal({ dealId: deal.id, properties });
            res.should.have.property('id');
            res.should.have.property('properties');
            res.should.have.property('createdAt');
            res.should.have.property('updatedAt');
            res.should.have.property('archived');
        });

        it('should get deal stage history', async () => {
            let res = await api.getDealStageHistory(deal.id);
            res.should.be.an('array');
            res[0].should.have.property('name');
            res[0].should.have.property('value');
            res[0].should.have.property('timestamp');
            res[0].should.have.property('sourceId');
            res[0].should.have.property('source');
            res[0].should.have.property('sourceVid');
            res[0].should.have.property('requestId');
        });

        it('should list deals', async () => {
            let res = await api.listDeals({ limit: 1 });
            res.should.have.property('paging');
            res.should.have.property('results');

            let res2 = await api.listDeals({
                limit: 1,
                after: res.paging.next.after,
            });
            // res2.should.have.property('paging');
            res2.should.have.property('results');
        });

        it('should search for deals', async () => {
            let body = {
                filterGroups: [
                    {
                        filters: [
                            {
                                value: '10',
                                propertyName: 'days_to_close',
                                operator: 'LT',
                            },
                        ],
                    },
                ],
                sorts: ['value'],
                limit: 1,
            };

            let res = await api.searchDeals(body);
            res.should.have.property('total');
            res.should.have.property('results');
        });

        it('should get next page of search results for deals', async () => {
            let body_1 = {
                sorts: ['value'],
                limit: 1,
            };

            let res_1 = await api.searchDeals(body_1);
            res_1.should.have.property('total');
            res_1.should.have.property('results');
            // res_1.should.have.property('paging');
            if (res_1.paging.next) {
                nextPage = res_1.paging.next.after;
            }

            let body_2 = {
                sorts: ['value'],
                limit: 1,
                after: nextPage,
            };

            let res_2 = await api.searchDeals(body_2);
            res_2.should.have.property('total');
            res_2.should.have.property('results');
            // res_2.should.have.property('paging');
        });

        it('should return only 5 deals', async () => {
            let body = {
                sorts: [
                    {
                        propertyName: 'hs_lastmodifieddate',
                        direction: 'DESCENDING',
                    },
                ],
                allProps: true,
                maxRecords: 50,
                limit: 5,
            };

            let res = await api.searchDeals(body);
        });
    });

    describe('Deal Properties', async () => {
        let property;
        before(async () => {
            const body = {
                name: 'testimate',
                label: 'Estimated Amount',
                type: 'number',
                fieldType: 'number',
                groupName: 'dealinformation',
            };
            property = await api.createProperty('deal', body);
            property.should.have.property('name');
        });

        after(async () => {
            let deleted = await api.deleteProperty('deal', property.name);
            // let deleted = await api.deleteProperty('deal', "estimate");
            deleted.status.should.equal(204);
        });

        it('should create a deal property', async () => {
            //Hope the before happens
        });

        it('should delete a deal property', async () => {
            //Hope the after works
        });

        it('should list deal properties', async () => {
            let res = await api.getProperties('deal');
            res.should.have.property('results');
            res.results.should.be.an('array');
        });

        it('should get deal property by name', async () => {
            let res = await api.getPropertyByName('deal', property.name);
            res.should.have.property('name');
            // res.should.have.property('properties');
            res.should.have.property('createdAt');
            res.should.have.property('updatedAt');
            res.should.have.property('archived');
        });

        it('should update deal property by name', async () => {
            const body = {
                label: 'Estimated Amount Test',
                type: 'string',
                fieldType: 'text',
            };
            let res = await api.updateProperty('deal', property.name, body);
            res.should.have.property('name');
            res.should.have.property('updatedAt');
            res.should.have.property('createdAt');
            res.should.have.property('label');
            res.should.have.property('type');
            res.should.have.property('fieldType');
            res.name.should.equal(property.name);
            res.label.should.equal(body.label);
            res.type.should.equal(body.type);
            res.fieldType.should.equal(body.fieldType);
        });

        describe('Deals that use custom proerties', async () => {
            let deal;
            before(async () => {
                const body = {
                    amount: '1234.00',
                    dealname: 'Unit test deal',
                    dealstage: 'presentationscheduled',
                    testimate: 10,
                };
                deal = await api.createDeal(body);
                deal.should.have.property('id');
                deal.should.have.property('properties');
                deal.should.have.property('createdAt');
                deal.should.have.property('updatedAt');
                deal.should.have.property('archived');
            });

            after(async () => {
                const deleted = await api.archiveDeal(deal.id);
                deleted.status.should.equal(204);
            });

            it('should create a deal with a custom property', async () => {
                // Hope the before works
            });

            it('should delete/archive a deal with a custom property', async () => {
                // Hope the after works
            });

            it('should update a deal with a custom property', async () => {
                let properties = {
                    testimate: 100,
                };
                let res = await api.updateDeal({ dealId: deal.id, properties });
                deal.should.have.property('id');
                deal.should.have.property('properties');
                deal.should.have.property('createdAt');
                deal.should.have.property('updatedAt');
                deal.should.have.property('archived');
            });
        });
    });
});

require('./Api2.test');
