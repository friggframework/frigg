const chai = require('chai');
const TestUtils = require('../../../test/utils/TestUtils');

const should = chai.should();

const Authenticator = require('../../../test/utils/Authenticator');
const ApiClass = require('./Api.js');

describe.only('Attentive Api Class Tests', async () => {
    const api = new ApiClass({ backOff: [1, 3, 10] });
    before(async () => {
        const url = api.authorizationUri;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const token = await api.getTokenFromCode(response.data.code);
    });

    describe('Catalog Uploads', async () => {

        before(async () => {

        });

        after(async () => {

        });

        it('should get token identity', async () => {

            const res = await api.getTokenIdentity()
            expect(res).to.not.be.null
        });

    });
});
