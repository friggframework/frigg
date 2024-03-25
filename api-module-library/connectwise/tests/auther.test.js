const { connectToDatabase, disconnectFromDatabase, createObjectId, Auther } = require('@friggframework/core');
//require('dotenv').config();
const { Definition} = require('../definition');
const {
    testDefinitionRequiredAuthMethods,
    testAutherDefinition
} = require("@friggframework/devtools");

const authParams = {
    company_id: process.env.CONNECTWISE_COMPANY_ID,
    public_key: process.env.CONNECTWISE_PUBLIC_KEY,
    private_key: process.env.CONNECTWISE_PRIVATE_KEY,
    site: process.env.CONNECTWISE_SITE,
}

const mocks = {
    getAccountStatus: {
        status: 'active',
    }
}
//testAutherDefinition(Definition, mocks)

describe('Connectwise Module Live Tests', () => {
    let auther;
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

    describe('Authorization requests', () => {
        let firstRes;
        it('processAuthorizationCallback()', async () => {
            firstRes = await auther.processAuthorizationCallback(authParams);
            expect(firstRes).toBeDefined();
            expect(firstRes.entity_id).toBeDefined();
            expect(firstRes.credential_id).toBeDefined();
        });
        it('retrieves existing entity on subsequent calls', async () =>{
            const res = await auther.processAuthorizationCallback(authParams);
            expect(res).toEqual(firstRes);
        });
        it('Should test the Definition methods individually', async () => {
            await testDefinitionRequiredAuthMethods(auther.api, Definition,undefined,undefined,auther.userId);
        });
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
