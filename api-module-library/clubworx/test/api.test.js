const chai = require('chai');
const should = chai.should();
const { Api } = require('../api');
require('dotenv').config();
const { expect } = require('chai');

describe('Clubworx API class', () => {
    const api = new Api({
        accountKey: process.env.CLUBWORX_ACCOUNT_KEY,
    });

    describe.skip('Records', () => {
        let recordID;

        it('should create a record', async () => {
            const body = {
                type: 'nDAs',
                name: 'Example Record',
                properties: {
                    agreementDate: {
                        type: 'date',
                        value: '2022-08-12T00:00:00-07:00',
                    },
                    counterpartyName: {
                        type: 'string',
                        value: 'John Doe',
                    },
                },
            };
            const response = await api.createRecord(body);
            expect(response).to.have.property('id');
            expect(response).to.have.property('type');
            expect(response).to.have.property('name');
            expect(response).to.have.property('lastUpdated');
            recordID = response.id;
        });

        it('should list all records', async () => {
            const response = await api.listAllRecords();
            expect(response).to.have.property('page');
            expect(response).to.have.property('pageSize');
            expect(response).to.have.property('count');
            expect(response).to.have.property('list');
        });

        it('should list all record schemas', async () => {
            const response = await api.listAllRecordSchemas();
            expect(response).to.have.property('properties');
            expect(response).to.have.property('recordTypes');
        });

        it('should retrieve a record', async () => {
            const response = await api.retrieveRecord(recordID);
            expect(response).to.have.property('id');
            expect(response).to.have.property('type');
            expect(response).to.have.property('name');
            expect(response).to.have.property('lastUpdated');
            expect(response).to.have.property('properties');
            expect(response).to.have.property('attachments');
            expect(response).to.have.property('links');
        });

        it('should update a record metadata', async () => {
            const body = {
                type: 'nDAs',
                name: 'Updated Example Record',
                addProperties: {
                    counterpartyName: {
                        type: 'string',
                        value: 'Jane Doe',
                    },
                },
            };
            const response = await api.updateRecord(recordID, body);
            expect(response).to.have.property('id');
            expect(response).to.have.property('type');
            expect(response).to.have.property('name');
            expect(response).to.have.property('properties');
            expect(response).to.have.property('lastUpdated');
            expect(response.properties.counterpartyName.value).to.equal(
                'Jane Doe'
            );
        });

        it('should delete a record', async () => {
            const response = await api.deleteRecord(recordID);
            expect(response.status).to.equal(204);
            expect(response.statusText).to.equal('No Content');
        });
    });
});
