const chai = require('chai');
const StackApi = require('../../src/modules/Stack/Api.js');

const { expect } = chai;
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);

const COMPANY_ID = 83;

describe.skip('StackApi', async () => {
    let bearer = '';
    let api;
    before(async () => {
        api = new StackApi({
            companyId: COMPANY_ID,
            token: process.env.STACK_SECRET,
            type: process.env.STACK_TYPE,
        });
    });

    describe('authorize', async () => {
        it('should return authorize data', async () => {
            const response = await api.authorize();
            expect(response).to.have.property('status').eql(200);
            expect(response.body).to.have.property('data');
            bearer = response.body.data;
        });
    });

    describe('getSalesCycle', async () => {
        it('should return sales cycle', async () => {
            const response = await api.getSalesCycle(bearer);
            expect(response).to.have.property('status').eql(200);
            expect(response.body).to.have.property('stages');
        });
    });

    describe('getSalesCycle', async () => {
        it('should return a 401 error', async () => {
            const response = await api.getSalesCycle('123');
            expect(response).to.have.property('status').eql(401);
        });
    });

    describe('getCompany', async () => {
        it('should return company', async () => {
            const response = await api.getCompany(bearer);
            expect(response).to.have.property('status').eql(200);
            expect(response.body).to.have.property('id');
        });
    });

    describe('getCompany', async () => {
        it('should return a 401 error', async () => {
            const response = await api.getCompany('123');
            expect(response).to.have.property('status').eql(401);
        });
    });
});
