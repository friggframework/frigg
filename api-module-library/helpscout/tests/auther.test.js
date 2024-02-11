//require('dotenv').config();
const { Definition} = require('../definition');
const { Auther } = require('@friggframework/module-plugin');
const {connectToDatabase, disconnectFromDatabase, createObjectId} = require('@friggframework/database/mongo');
const { Authenticator, testDefinition } = require("@friggframework/test-environment");

describe('HelpScout Auther Tests', () => {
    let auther, authUrl;
    beforeAll(async () => {
        await connectToDatabase();
        auther = await Auther.getInstance({
            definition: Definition,
            userId: createObjectId(),
        });
    });

    afterAll(async () => {
        await auther.CredentialModel.deleteMany();
        await auther.EntityModel.deleteMany();
        await disconnectFromDatabase();
    });

    describe('getAuthorizationRequirements() test', () => {
        it('should return auth requirements', async () => {
            const requirements = auther.getAuthorizationRequirements();
            expect(requirements).toBeDefined();
            expect(requirements.type).toEqual('oauth2');
            expect(requirements.url).toBeDefined();
            authUrl = requirements.url;
        });
    });

    describe('Authorization requests', () => {
        let firstRes;
        it('processAuthorizationCallback()', async () => {
            const response = await Authenticator.oauth2(authUrl, 3000, 'google chrome');            
            firstRes = await auther.processAuthorizationCallback({
                data: {
                    code: response.data.code,
                },
            });
            expect(firstRes).toBeDefined();
            expect(firstRes.entity_id).toBeDefined();
            expect(firstRes.credential_id).toBeDefined();            
        }, 10000);
        it.skip('retrieves existing entity on subsequent calls', async () =>{
            const response = await Authenticator.oauth2(authUrl, 3000, 'google chrome');
            const res = await auther.processAuthorizationCallback({
                data: {
                    code: response.data.code,
                },
            });
            expect(res).toEqual(firstRes);
        });
        it('Should test the Definition methods', async () => {
            await testDefinition(auther.api, Definition,undefined,undefined,auther.userId);
        }, 10000)
    });
    describe('Test credential retrieval and auther instantiation', () => {
        it('retrieve by entity id', async () => {
            const newAuther = await Auther.getInstance({
                userId: auther.userId,
                entityId: auther.entity.id,
                definition: Definition,
            });
            expect(newAuther).toBeDefined();
            expect(newAuther.entity).toBeDefined();
            expect(newAuther.credential).toBeDefined();
            expect(await newAuther.testAuth()).toBeTruthy();
        });

        it('retrieve by credential id', async () => {
            const newAuther = await Auther.getInstance({
                userId: auther.userId,
                credentialId: auther.credential.id,
                definition: Definition,
            });
            expect(newAuther).toBeDefined();
            expect(newAuther.credential).toBeDefined();
            expect(await newAuther.testAuth()).toBeTruthy();
        });
    });
});
