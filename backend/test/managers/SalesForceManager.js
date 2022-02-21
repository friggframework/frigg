const chai = require('chai');
const SalesForceManager = require('../../src/modules/Salesforce/Manager.js');

const { expect } = chai;
const chaiAsPromised = require('chai-as-promised');
chai.use(require('chai-url'));

chai.use(chaiAsPromised);

describe.skip('SalesForceManager', async () => {
    let manager;
    before(async () => {
        manager = new SalesForceManager({
            userEmail: 'jose.delgado@golabstech.com',
        });
    });

    describe('getAccessToken', async () => {
        it('should get the access token', async () => {
            const response = await manager.getAccessToken(
                'aPrx9e9Z3rfks67wJbaRZX6PwXR6R9ZCSUmNiFVXncd99m3fO3_gxjiszRkjyEOwK.gH09xh3Q=='
            );
            expect(response).to.have.property('refreshToken');
            expect(response).to.have.property('accessToken');
        });
    });

    describe('getTokenFromRefreshToken', async () => {
        it('should get the access token from the referesh token', async () => {
            const response = await manager.getTokenFromRefreshToken();
            expect(response).to.have.property('refreshToken');
            expect(response).to.have.property('accessToken');
        });
    });
});
