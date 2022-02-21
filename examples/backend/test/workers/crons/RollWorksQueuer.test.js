const moment = require('moment');
const AWS = require('aws-sdk');
/**
 * General Test Related Imports
 */

const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const chaiHttp = require('chai-http');
const expect = chai.expect;
const should = chai.should();
chai.use(chaiHttp);
/**
 * Internal requires
 */

const TestUtils = require('../../utils/TestUtils');

/**
 * Worker being tested
 */
const RollWorksQueuer = require('../../../src/workers/crons/RollWorksQueuer');
const LHWorker = require('../../../src/base/LHWorker');
const Integration = require('../../../src/base/models/Integration');

/**
 * For Integration Creation purposes
 */
// const app = require('../../../app.js');
// const auth = require('../../../src/routers/auth');

// app.use(auth);

const Authenticator = require('../../utils/Authenticator');

const orgUuid = process.env.CROSSBEAM_TEST_ORG_UUID;

const testCreds = {
    client_id: process.env.CROSSBEAM_TEST_CLIENT_ID,
    client_secret: process.env.CROSSBEAM_TEST_CLIENT_SECRET,
};

/**
 * Other constants needed for the tests
 */
const IntegrationFactory = require('../../../src/managers/integrations/IntegrationManager');

const EntityPairs = [
    { entityType: 'rollworks', connectingEntityType: 'crossbeam' },
];

describe.skip('RollWorks Queuer Test', async () => {
    const sandbox = sinon.createSandbox();

    before(async () => {
        this.token = await TestUtils.generateJwt();
        this.integrations = [];
        this.worker = await new RollWorksQueuer();
    });

    after(async () => {
        sandbox.restore();
        const updatedIntegrationMO = new Integration();

        for (const index in this.integrations) {
            await updatedIntegrationMO.delete(this.integrations[index].id);
        }
    });

    it('Should create an integration per EntityPair', async () => {
        for (const pair of EntityPairs) {
            let authUrl;
            let requiredData;
            const res = await chai
                .request(app)
                .get('/api/authorize')
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${this.token}`)
                .set('organization_uuid', orgUuid)
                .query(pair);
            res.status.should.equal(200);
            chai.assert.hasAllKeys(res.body, ['url', 'type']);
            if (res.body.type === 'oauth1' || res.body.type === 'oauth2')
                authUrl = res.body.url;
            if (res.body.type !== 'oauth1' && res.body.type !== 'oauth2')
                requiredData = res.body.data;
            const authType = res.body.type;

            if (authType !== 'oauth1' && authType !== 'oauth2') this.skip();
            const response = await Authenticator.oauth2(authUrl);
            const baseArr = response.base.split('/');
            response.entityType = baseArr[baseArr.length - 1];
            delete response.base;
            chai.assert.hasAllKeys(response, ['entityType', 'data']);
            expect(response).to.have.nested.property('data.code');

            // Oauth/oauth2 approach

            // Will need to figure out how to add other credential types
            // such as API keys on this step.

            const authorizeRes = await chai
                .request(app)
                .post('/api/authorize')
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${this.token}`)
                .set('organization_uuid', orgUuid)
                .send(response);

            chai.assert.hasAllKeys(authorizeRes.body, [
                'credential_id',
                'entity_id',
                'type',
            ]);
            const credentialId = authorizeRes.body.credential_id;

            const entityId = authorizeRes.body.entity_id;

            const xbeamBody = {
                entityType: 'crossbeam',
                data: {
                    credentialType: pair.entityType,
                    ...testCreds,
                },
            };
            const xbeamAuthorizeRes = await chai
                .request(app)
                .post('/api/authorize')
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${this.token}`)
                .set('organization_uuid', orgUuid)
                .send(xbeamBody);

            chai.assert.hasAllKeys(xbeamAuthorizeRes.body, [
                'credential_id',
                'entity_id',
                'type',
            ]);

            const xbeamCredentialId = xbeamAuthorizeRes.body.credential_id;
            const xbeamEntityId = xbeamAuthorizeRes.body.entity_id;
            const integrationCreateBody = {
                entities: [xbeamEntityId, entityId],
                config: {
                    type: pair.entityType,
                    category: 'Example',
                },
            };
            const integrationRes = await chai
                .request(app)
                .post('/api/integrations')
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${this.token}`)
                .set('organization_uuid', orgUuid)
                .send(integrationCreateBody);

            chai.assert.hasAnyKeys(integrationRes.body, ['id']);
            this.integrations.push(integrationRes.body);
        }
    });

    it('Should wake up the Queuer and "queue" up a Partner Poll', async () => {
        // this.integrationMO = new Integration();
        // const integrations = await this.integrationMO.list(
        //     {
        //         'config.type': 'rollworks', status: 'ENABLED',
        //     },
        // );
        // integrations.pop();
        // for (const integration of integrations) {
        //     await integration.delete(integration.id);
        // }

        const testBody = {
            Records: [
                {
                    body: JSON.stringify({ fake: 'body' }),
                },
            ],
        };
        sandbox.spy(this.worker.runOne);
        sandbox.stub(LHWorker.prototype, 'sendAsyncSQSMessage').returns('Test');
        // sandbox.stub(AWS.SQS.prototype, 'sendMessage').returns('Test');

        const res = await this.worker.run(testBody);

        chai.assert(this.worker.runOne.called);
        return res;
        sandbox.restore();
    });
});
