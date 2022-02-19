/**
 * @group interactive
 */

require('../../utils/TestUtils');
const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

chai.use(sinonChai);

const { expect } = chai;
const chaiAsPromised = require('chai-as-promised');
chai.use(require('chai-url'));

chai.use(chaiAsPromised);

const Authenticator = require('../../utils/Authenticator');
const IntegrationFactory = require('../../../src/managers/integrations/IntegrationManager');
const TargetEntityManager = require('../../../src/managers/entities/MondayManager');
const PrimaryEntityManager = require('../../../src/managers/entities/CrossbeamManager');
const TestUtils = require('../../utils/TestUtils');

const testSecretAndId = {
    client_id: process.env.CROSSBEAM_TEST_CLIENT_ID,
    client_secret: process.env.CROSSBEAM_TEST_CLIENT_SECRET,
};

describe.skip('Monday.com Integration Manager', () => {
    beforeAll(async () => {
        this.userManager = await TestUtils.getLoggedInTestUserManagerInstance();
        this.targetEntityManager = await TargetEntityManager.getInstance({
            userId: this.userManager.getUserId(),
        });
        this.primaryEntityManager = await PrimaryEntityManager.getInstance({
            userId: this.userManager.getUserId(),
            subType: 'monday',
        });
    });

    afterAll(async () => {
        // sandbox.restore();
        await this.integrationManagerInstance.processDelete();
        await IntegrationFactory.deleteIntegrationForUserById(
            this.userManager.getUserId(),
            this.integrationManagerInstance.integration.id
        );
    });

    describe('Monday.com Authentication Requests', () => {
        let testContext;

        beforeAll(() => {
            testContext = {};
        });

        let authorizeUrl;
        it('Should return Auth Requirements', async () => {
            const res =
                await testContext.targetEntityManager.getAuthorizationRequirements();

            chai.assert.hasAnyKeys(res, ['url', 'type']);
            authorizeUrl = res.url;
        });
        it('Should go through OAuth Flow and processAuthorizationCallback', async () => {
            const response = await Authenticator.oauth2(authorizeUrl);
            const baseArr = response.base.split('/');
            response.entityType = baseArr[baseArr.length - 1];
            delete response.base;

            const ids =
                await testContext.targetEntityManager.processAuthorizationCallback(
                    {
                        userId: this.userManager.getUserId(),
                        data: response.data,
                    }
                );

            // TODO Should not be empty (any key)
            chai.assert.hasAllKeys(ids, ['credential_id', 'entity_id', 'type']);
            testContext.targetEntityId = ids.entity_id;
        });
    });
    describe('Crossbeam Authentication Requests', () => {
        let testContext;

        beforeAll(() => {
            testContext = {};
        });

        it('Should processAuthorizationCallback and return cred and entity ids', async () => {
            const data = {
                credentialType: 'monday',
                ...testSecretAndId,
            };
            const ids =
                await testContext.primaryEntityManager.processAuthorizationCallback(
                    {
                        userId: testContext.userManager.id,
                        data,
                    }
                );
            chai.assert.hasAllKeys(ids, ['credential_id', 'entity_id', 'type']);
            testContext.primaryEntityId = ids.entity_id;
        });
    });

    describe('Integration Creation', () => {
        let testContext;

        beforeAll(() => {
            testContext = {};
        });

        it('Should Take the entities and create an integration', async () => {
            const entities = [
                testContext.primaryEntityId,
                testContext.targetEntityId,
            ];
            const config = {
                type: 'monday',
            };
            testContext.integrationManagerInstance =
                await IntegrationFactory.createIntegration(
                    entities,
                    testContext.userManager.getUserId(),
                    config
                );

            await testContext.integrationManagerInstance.processCreate();

            expect(
                testContext.integrationManagerInstance.integration.config.boards
            ).to.be.undefined;
        });

        it('Should be "NEEDS_CONFIG"', async () => {
            expect(
                testContext.integrationManagerInstance.integration.status
            ).to.equal('NEEDS_CONFIG');
        });

        it('Should return config options of useMasterBoards and reports', async () => {
            const options =
                await testContext.integrationManagerInstance.getConfigOptions();
            expect(options).to.be.an('array');
            expect(options.map((e) => e.key)).to.deep.include.members([
                'useMasterBoards',
                'reports',
            ]);
        });
    });
    describe('Integration Update', () => {
        let testContext;

        beforeAll(() => {
            testContext = {};
        });

        it('Should update the integration with useMasterBoards set to true', async () => {
            const testConfig = {
                useMasterBoards: true,
            };

            const updateRes =
                await testContext.integrationManagerInstance.processUpdate({
                    config: testConfig,
                });
            expect(
                testContext.integrationManagerInstance.integration.status
            ).to.equal('ENABLED');
            expect(
                testContext.integrationManagerInstance.integration.config.boards
            ).to.exist;
        });

        describe('Report Selection', () => {
            beforeAll(async () => {
                const reports =
                    await testContext.integrationManagerInstance.primaryInstance.listAllReports();
                testContext.report1 = reports[0];
                testContext.report2 = reports[1];
            });
            it('Should update the integration with the first returned report one, then two, then one report', async () => {
                const config = {
                    reports: [{ id: this.report1.id, name: this.report1.name }],
                };

                const firstUpdate =
                    await await testContext.integrationManagerInstance.processUpdate(
                        {
                            config,
                        }
                    );
                expect(
                    testContext.integrationManagerInstance.integration.status
                ).to.equal('ENABLED');
                expect(
                    testContext.integrationManagerInstance.integration.config
                        .reports
                ).to.exist;
                expect(
                    testContext.integrationManagerInstance.integration.config
                        .reports[testContext.report1.id]
                ).to.exist;
            });

            it('Should sync the first report data over', async () => {
                const reportData =
                    await testContext.integrationManagerInstance.primaryInstance.listAllReportData(
                        testContext.report1.id
                    );
                const finalReportData = {
                    items: reportData,
                    report_id: testContext.report1.id,
                };
                const res = await testContext.integrationManagerInstance.notify(
                    'NEW_REPORT_DATA',
                    finalReportData
                );
            });
            it('Should update the integration with two returned reports', async () => {
                const config = {
                    reports: [
                        { id: this.report2.id, name: this.report2.name },
                        { id: this.report1.id, name: this.report1.name },
                    ],
                };

                const secondUpdate =
                    await await testContext.integrationManagerInstance.processUpdate(
                        {
                            config,
                        }
                    );
                expect(
                    testContext.integrationManagerInstance.integration.status
                ).to.equal('ENABLED');
                expect(
                    testContext.integrationManagerInstance.integration.config
                        .reports
                ).to.exist;
                expect(
                    testContext.integrationManagerInstance.integration.config
                        .reports[testContext.report1.id]
                ).to.exist;
                expect(
                    testContext.integrationManagerInstance.integration.config
                        .reports[testContext.report2.id]
                ).to.exist;
            });

            it('Should sync the second report data over', async () => {
                const reportData =
                    await testContext.integrationManagerInstance.primaryInstance.listAllReportData(
                        testContext.report2.id
                    );
                const finalReportData = {
                    items: reportData,
                    report_id: testContext.report2.id,
                };
                const res = await testContext.integrationManagerInstance.notify(
                    'NEW_REPORT_DATA',
                    finalReportData
                );
            });
            it('Should update the integration just the second returned report', async () => {
                const config = {
                    reports: [{ id: this.report2.id, name: this.report2.name }],
                };

                const thirdUpdate =
                    await await testContext.integrationManagerInstance.processUpdate(
                        {
                            config,
                        }
                    );
                expect(
                    testContext.integrationManagerInstance.integration.status
                ).to.equal('ENABLED');
                expect(
                    testContext.integrationManagerInstance.integration.config
                        .reports
                ).to.exist;
                expect(
                    testContext.integrationManagerInstance.integration.config
                        .reports[testContext.report1.id]
                ).to.not.exist;
                expect(
                    testContext.integrationManagerInstance.integration.config
                        .reports[testContext.report2.id]
                ).to.exist;
            });

            it('Should update the integration with no reports', async () => {
                const config = {
                    reports: [],
                };

                const update =
                    await await testContext.integrationManagerInstance.processUpdate(
                        {
                            config,
                        }
                    );
                expect(
                    testContext.integrationManagerInstance.integration.status
                ).to.equal('ENABLED');
                expect(
                    testContext.integrationManagerInstance.integration.config
                        .reports
                ).to.not.exist;
            });

            it('Should handle reports plus masterBoards', async () => {
                const testConfig = {
                    useMasterBoards: true,
                    reports: [
                        { id: this.report2.id, name: this.report2.name },
                        { id: this.report1.id, name: this.report1.name },
                    ],
                };

                const updateRes =
                    await testContext.integrationManagerInstance.processUpdate({
                        config: testConfig,
                    });
                expect(
                    testContext.integrationManagerInstance.integration.status
                ).to.equal('ENABLED');
                expect(
                    testContext.integrationManagerInstance.integration.config
                        .boards
                ).to.exist;
            });
        });
    });

    describe('Test IntegrationManager Functions', () => {
        let testContext;

        beforeAll(() => {
            testContext = {};
        });

        it('Tests NEW_ACCOUNT_DATA notification', async () => {
            const partnerAccountData =
                await testContext.integrationManagerInstance.primaryInstance.listAllPartnerRecords();
            const res = await testContext.integrationManagerInstance.notify(
                'NEW_PARTNER_DATA',
                partnerAccountData
            );
        });
    });

    it('Should run ', async () => {});
});
