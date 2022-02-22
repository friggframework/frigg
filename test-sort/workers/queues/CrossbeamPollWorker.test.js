/**
 * @group interactive
 */

const moment = require('moment');

/**
 * General Test Related Imports
 */

const chai = require('chai');
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
const CrossbeamPollWorker = require('../../../src/workers/queues/CrossbeamPollWorker');

/**
 * For Integration Creation purposes
 */
const { createApp } = require('../../../app');
const auth = require('../../../src/routers/auth');

const app = createApp((app) => app.use(auth));

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

const oneWeekAgo = moment(Date.now()).subtract(7, 'd');

const EntityPairs = [
    // { entityType: 'monday', connectingEntityType: 'crossbeam' },
    { entityType: 'rollworks', connectingEntityType: 'crossbeam' },
];

const IntegrationTestClass = require('../../utils/reusableTestFunctions/integration');

const IntegrationTests = new IntegrationTestClass({ app });

describe.skip('Crossbeam Poll Worker Test', () => {
    beforeAll(async () => {
        this.token = await TestUtils.generateJwt();
        this.integrations = [];
        this.worker = await new CrossbeamPollWorker();

        const integrations = await IntegrationTests.createIntegrationPerEntity(
            this,
            EntityPairs,
            orgUuid
        );
    });

    afterAll(async () => {
        const res = await IntegrationTests.disconnectIntegrations(
            this,
            orgUuid
        );
    });

    it('Should create an integration per EntityPair', async () => 'done'); // since this is all done in the before block

    it('Should Process a "queued" historical Partner Data sync for each integration', async () => {
        for (const integration of this.integrations) {
            if (integration.config.type === 'monday') {
                // TODO- maybe some advanced lookup of IntegrationManager to see events? meh
                const testBody = {
                    Records: [
                        {
                            body: JSON.stringify({
                                integrationId: integration.id,
                                pollType: 'PARTNER_RECORDS_POLL',
                            }),
                        },
                    ],
                };

                const res = await this.worker.run(testBody);
                return res;
            }
        }
    });

    // it('Should Process a "queued" Partner Data poll from one week ago', async () => {
    //     for (const integration of this.integrations) {
    //         if (integration.config.type === 'monday') { // TODO- maybe some advanced lookup of IntegrationManager to see events? meh
    //             const testBody = {
    //                 Records: [
    //                     {
    //                         body: JSON.stringify({
    //                             integrationId: integration.id,
    //                             pollType: 'PARTNER_RECORDS_POLL',
    //                             startDate: oneWeekAgo,
    //                         }),
    //                     },
    //                 ],

    //             };

    //             const res = await this.worker.run(testBody);
    //             return res;
    //         }
    //     }
    // });

    it('Should Process a "queued" historical Report Data sync for each integration', async () => {
        for (const integration of this.integrations) {
            if (integration.config.type === 'rollworks') {
                // Currently this is how we can determine if we need it.
                const testBody = {
                    Records: [
                        {
                            body: JSON.stringify({
                                integrationId: integration.id,
                                pollType: 'REPORT_DATA_POLL',
                                reportId: this.reportId,
                                // startDate: oneWeekAgo,
                            }),
                        },
                    ],
                };

                const res = await this.worker.run(testBody);
                return res;
            }
        }
    });

    // it('Should Process a "queued" Report Data poll from one week ago for each', async () => {
    //     for (const integration of this.integrations) {
    //         if (integration.config.type === 'rollworks') { // Currently this is how we can determine if we need it.
    //             const testBody = {
    //                 Records: [
    //                     {
    //                         body: JSON.stringify({
    //                             integrationId: integration.id,
    //                             pollType: 'REPORT_DATA_POLL',
    //                             reportId: this.reportId,
    //                             startDate: oneWeekAgo,
    //                         }),
    //                     },
    //                 ],

    //             };

    //             const res = await this.worker.run(testBody);
    //             return res;
    //         }
    //     }
    // });

    it('Should disconnect any integrations created', async () => 'done'); // Hope the after works!
});
