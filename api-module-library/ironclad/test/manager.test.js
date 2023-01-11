const Manager = require('../manager');
const mongoose = require('mongoose');
const config = require('../defaultConfig.json');
const { expect } = require('chai');
require('dotenv').config();

describe(`Should fully test the ${config.label} Manager`, () => {
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
        it('should return client', async () => {
            const authRes = await manager.processAuthorizationCallback({
                data: {
                    apiKey: process.env.IRONCLAD_API_KEY,
                    subdomain: process.env.IRONCLAD_SUBDOMAIN,
                },
            });
            expect(authRes).exists;
            expect(authRes).to.have.property('entity_id');
            expect(authRes).to.have.property('credential_id');
            expect(authRes).to.have.property('type');
        });
        it('should error if incorrect auth data', async () => {
            try {
                const authRes = await manager.processAuthorizationCallback({
                    data: {
                        apiKey: 'bad',
                        subdomain: process.env.IRONCLAD_SUBDOMAIN,
                    },
                });
                expect(authRes).to.not.exist;
            } catch (e) {
                expect(e.message).to.contain('Auth Error');
            }
        });
        it('should return store subType', async () => {
            const authRes = await manager.processAuthorizationCallback({
                data: {
                    apiKey: process.env.IRONCLAD_API_KEY,
                    subdomain: process.env.IRONCLAD_SUBDOMAIN,
                    subType: process.env.IRONCLAD_SUBTYPE,
                },
            });
            expect(authRes).exists;
            expect(authRes).to.have.property('entity_id');
            expect(authRes).to.have.property('credential_id');
            expect(authRes).to.have.property('type');
        });
        it('should return distinguish between subTypes', async () => {
            const authRes = await manager.processAuthorizationCallback({
                data: {
                    apiKey: process.env.IRONCLAD_API_KEY,
                    subdomain: process.env.IRONCLAD_SUBDOMAIN,
                    subType: process.env.IRONCLAD_SUBTYPE,
                },
            });
            expect(authRes).exists;
            expect(authRes).to.have.property('entity_id');
            expect(authRes).to.have.property('credential_id');
            expect(authRes).to.have.property('type');
            const secondAuthRes = await manager.processAuthorizationCallback({
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
