/**
 * @group interactive
 */

const moment = require('moment');

/**
 * General Test Related Imports
 */

const chai = require('chai');
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
/**
 * Internal requires
 */

const TestUtils = require('../../utils/TestUtils');

/**
 * Worker being tested
 */
const MondayQueuer = require('../../../src/workers/crons/MondayQueuer');

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
    { entityType: 'monday', connectingEntityType: 'crossbeam' },
];

describe.skip('Monday Queuer Test', () => {
    beforeAll(async () => {
        this.token = await TestUtils.generateJwt();
        this.integrations = [];
        this.worker = await new MondayQueuer();
    });

    it('Should create an integration per EntityPair', async () => {
        afterAll(async () => {
            await disconnectFromDatabase();
        });

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
        const testBody = {
            Records: [
                {
                    body: JSON.stringify({ fake: 'body' }),
                },
            ],
        };

        await this.worker.run(testBody);
    });
});
