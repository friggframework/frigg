require('dotenv').config();
const Manager = require('../manager');
const mongoose = require('mongoose');
const config = require('../defaultConfig.json');
const { expect } = require('chai');


const testAuthData = {
    apiKey: process.env.GOOGLE_DRIVE_TEST_API_KEY,
    username: process.env.GOOGLE_DRIVE_TEST_USERNAME
};
describe('Google Drive Manager Tests', () => {
    let manager, userManager;

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGO_URI);
        manager = await Manager.getInstance({
            userId: new mongoose.Types.ObjectId(),
        });
    });

    afterAll(async () => {
        await Manager.Credential.deleteMany();
        await Manager.Entity.deleteMany();
        await mongoose.disconnect();
    });

    it('getAuthorizationRequirements() should return auth requirements', async () => {
        const requirements = await manager.getAuthorizationRequirements();
        expect(requirements).exists;
        expect(requirements.type).to.equal('apiKey');
    });
    describe('processAuthorizationCallback()', () => {
        describe('normalCallbacks', () => {
            let authRes;
            beforeAll(async () => {
                authRes = await manager.processAuthorizationCallback({
                    data: testAuthData,
                });
            });
            it('should return entity, credential, and type info', async () => {
                expect(authRes).exists;
                expect(authRes).to.have.property('entity_id');
                expect(authRes).to.have.property('credential_id');
                expect(authRes).to.have.property('type');
            });

            it('should error if incorrect auth data', async () => {
                try {
                    testAuthData.apiKey = 'invalid';
                    const authRes = await manager.processAuthorizationCallback({
                        data: testAuthData,
                    });
                    expect(authRes).to.not.exist;
                } catch (e) {
                    expect(e.message).to.contain('Auth Error');
                }
            });
            it('should CastError', async () => {
                try {
                    const authRes = await manager.processAuthorizationCallback({
                        data: {
                            subdomain: process.env.IRONCLAD_SUBDOMAIN,
                        },
                    });
                    expect(authRes).to.not.exist;
                } catch (e) {
                    expect(e.message).to.contain('Auth Error');
                }
            });
        });

        describe('subType tests', () => {
            let authRes;
            beforeAll(async () => {
                authRes = await manager.processAuthorizationCallback({
                    data: {
                        apiKey: process.env.IRONCLAD_API_KEY,
                        subdomain: process.env.IRONCLAD_SUBDOMAIN,
                        subType: process.env.IRONCLAD_SUBTYPE,
                    },
                });
            });
            it('should return store subType', async () => {
                expect(authRes).exists;
                expect(authRes).to.have.property('entity_id');
                expect(authRes).to.have.property('credential_id');
                expect(authRes).to.have.property('type');
                expect(authRes.subType).to.equal(process.env.IRONCLAD_SUBTYPE);
                expect(authRes.subType).to.not.be.null;
            });

            it('should return distinguish between subTypes', async () => {
                const secondAuthRes =
                    await manager.processAuthorizationCallback({
                        data: {
                            apiKey: process.env.IRONCLAD_API_KEY,
                            subdomain: process.env.IRONCLAD_SUBDOMAIN,
                            subType: 'fresh',
                        },
                    });
                expect(secondAuthRes).exists;
                expect(secondAuthRes).to.have.property('entity_id');
                expect(secondAuthRes).to.have.property('credential_id');
                expect(secondAuthRes).to.have.property('type');
                expect(secondAuthRes.entity_id).to.not.equal(authRes.entity_id);
            });
        });
    });
});
