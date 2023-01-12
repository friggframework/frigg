const Manager = require('../manager');
const mongoose = require('mongoose');
const config = require('../defaultConfig.json');
const { expect } = require('chai');
const Authenticator = require('@friggframework/test-environment/Authenticator');
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
        expect(requirements.type).to.equal('oauth2');
    });
    describe('processAuthorizationCallback()', () => {
        it.skip('should return client', async () => {
            const requirements = await manager.getAuthorizationRequirements();
            const { url } = requirements;
            const response = await Authenticator.oauth2(url);
            const baseArr = response.base.split('/');
            response.entityType = baseArr[baseArr.length - 1];
            delete response.base;
            expect(requirements).exists;
            expect(requirements.type).to.equal('oauth2');

            const authRes = await manager.processAuthorizationCallback({
                data: {
                    code: response.data.code,
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
                        code: 'bad',
                    },
                });
                expect(authRes).to.not.exist;
            } catch (e) {
                expect(e.message).to.contain('Auth Error');
            }
        });
    });
});
