const {Api} = require('./mock-api/api');
const hubspotMocks = require('./mock-api/mocks/hubspot');

const { Definition } = require('./mock-api/definition');
const { Auther } = require('../auther');
const { mongoose } = require('../../database/mongoose');



const getModule = async (params) => {
    const module = await Auther.getInstance({
        definition: Definition,
        userId: new mongoose.Types.ObjectId(),
        ...params,
    });
    module.api.getTokenFromCode = async function(code) {
        await this.setTokens(hubspotMocks.tokenResponse);
        return hubspotMocks.tokenResponse;
    }
    module.api.getUserDetails = async function() {
        return hubspotMocks.userDetailsResponse;
    }
    return module
}


describe('HubSpot Module Tests', () => {
    let module, authUrl;
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGO_URI);
        module = await getModule();
    });

    afterAll(async () => {
        await mongoose.disconnect();
    });

    describe('getAuthorizationRequirements() test', () => {
        it('should return auth requirements', async () => {
            const requirements = module.getAuthorizationRequirements();
            expect(requirements).toBeDefined();
            expect(requirements.type).toEqual('oauth2');
            expect(requirements.url).toBeDefined();
            authUrl = requirements.url;
        });
    });

    describe('Authorization requests', () => {
        let firstRes;
        it('processAuthorizationCallback()', async () => {
            const response = hubspotMocks.authorizeResponse;
            firstRes = await module.processAuthorizationCallback({
                data: {
                    code: response.data.code,
                },
            });
            expect(firstRes).toBeDefined();
            expect(firstRes.entity_id).toBeDefined();
            expect(firstRes.credential_id).toBeDefined();
        });
        it('retrieves existing entity on subsequent calls', async () =>{
            const response = hubspotMocks.authorizeResponse;
            const res = await module.processAuthorizationCallback({
                data: {
                    code: response.data.code,
                },
            });
            expect(res).toEqual(firstRes);
        });
    });
    describe('Test credential retrieval and module instantiation', () => {
        it('retrieve by entity id', async () => {
            const newModule = await getModule({
                userId: module.userId,
                entityId: module.entity.id,
                definition: Definition,
            });
            expect(newModule).toBeDefined();
            expect(newModule.entity).toBeDefined();
            expect(newModule.credential).toBeDefined();
            expect(await newModule.testAuth()).toBeTruthy();

        });

        it('retrieve by credential id', async () => {
            const newModule = await getModule({
                userId: module.userId,
                credentialId: module.credential.id,
                definition: Definition,
            });
            expect(newModule).toBeDefined();
            expect(newModule.credential).toBeDefined();
            expect(await newModule.testAuth()).toBeTruthy();

        });
    });
});
