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

describe.skip('Monday.com Integration Manager', async () => {
    before(async () => {
        this.userManager = await TestUtils.getLoggedInTestUserManagerInstance();
        this.targetEntityManager = await TargetEntityManager.getInstance({
            userId: this.userManager.getUserId(),
        });
        this.primaryEntityManager = await PrimaryEntityManager.getInstance({
            userId: this.userManager.getUserId(),
            subType: 'monday',
        });
    });

    after(async () => {
        // sandbox.restore();
        await this.integrationManagerInstance.processDelete();
        await IntegrationFactory.deleteIntegrationForUserById(
            this.userManager.getUserId(),
            this.integrationManagerInstance.integration.id
        );
    });

    describe('Monday.com Authentication Requests', async () => {
        let authorizeUrl;
        it('Should return Auth Requirements', async () => {
            const res =
                await this.targetEntityManager.getAuthorizationRequirements();

            chai.assert.hasAnyKeys(res, ['url', 'type']);
            authorizeUrl = res.url;
        });
        it('Should go through OAuth Flow and processAuthorizationCallback', async () => {
            const response = await Authenticator.oauth2(authorizeUrl);
            const baseArr = response.base.split('/');
            response.entityType = baseArr[baseArr.length - 1];
            delete response.base;

            const ids =
                await this.targetEntityManager.processAuthorizationCallback({
                    userId: this.userManager.getUserId(),
                    data: response.data,
                });

            // TODO Should not be empty (any key)
            chai.assert.hasAllKeys(ids, ['credential_id', 'entity_id', 'type']);
            this.targetEntityId = ids.entity_id;
        });
    });
    describe('Crossbeam Authentication Requests', async () => {
        it('Should processAuthorizationCallback and return cred and entity ids', async () => {
            const data = {
                credentialType: 'monday',
                ...testSecretAndId,
            };
            const ids =
                await this.primaryEntityManager.processAuthorizationCallback({
                    userId: this.userManager.id,
                    data,
                });
            chai.assert.hasAllKeys(ids, ['credential_id', 'entity_id', 'type']);
            this.primaryEntityId = ids.entity_id;
        });
    });

    describe('Integration Creation', async () => {
        it('Should Take the entities and create an integration', async () => {
            const entities = [this.primaryEntityId, this.targetEntityId];
            const config = {
                type: 'monday',
            };
            this.integrationManagerInstance =
                await IntegrationFactory.createIntegration(
                    entities,
                    this.userManager.getUserId(),
                    config
                );

            await this.integrationManagerInstance.processCreate();

            expect(this.integrationManagerInstance.integration.config.boards).to
                .be.undefined;
        });

        it('Should be "NEEDS_CONFIG"', async () => {
            expect(this.integrationManagerInstance.integration.status).to.equal(
                'NEEDS_CONFIG'
            );
        });

        it('Should return config options of useMasterBoards and reports', async () => {
            const options =
                await this.integrationManagerInstance.getConfigOptions();
            expect(options).to.be.an('array');
            expect(options.map((e) => e.key)).to.deep.include.members([
                'useMasterBoards',
                'reports',
            ]);
        });
    });
    describe('Integration Update', async () => {
        it('Should update the integration with useMasterBoards set to true', async () => {
            const testConfig = {
                useMasterBoards: true,
            };

            const updateRes =
                await this.integrationManagerInstance.processUpdate({
                    config: testConfig,
                });
            expect(this.integrationManagerInstance.integration.status).to.equal(
                'ENABLED'
            );
            expect(this.integrationManagerInstance.integration.config.boards).to
                .exist;
        });

        describe('Report Selection', async () => {
            before(async () => {
                const reports =
                    await this.integrationManagerInstance.primaryInstance.listAllReports();
                this.report1 = reports[0];
                this.report2 = reports[1];
            });
            it('Should update the integration with the first returned report one, then two, then one report', async () => {
                const config = {
                    reports: [{ id: this.report1.id, name: this.report1.name }],
                };

                const firstUpdate =
                    await await this.integrationManagerInstance.processUpdate({
                        config,
                    });
                expect(
                    this.integrationManagerInstance.integration.status
                ).to.equal('ENABLED');
                expect(
                    this.integrationManagerInstance.integration.config.reports
                ).to.exist;
                expect(
                    this.integrationManagerInstance.integration.config.reports[
                        this.report1.id
                    ]
                ).to.exist;
            });

            it('Should sync the first report data over', async () => {
                const reportData =
                    await this.integrationManagerInstance.primaryInstance.listAllReportData(
                        this.report1.id
                    );
                const finalReportData = {
                    items: reportData,
                    report_id: this.report1.id,
                };
                const res = await this.integrationManagerInstance.notify(
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
                    await await this.integrationManagerInstance.processUpdate({
                        config,
                    });
                expect(
                    this.integrationManagerInstance.integration.status
                ).to.equal('ENABLED');
                expect(
                    this.integrationManagerInstance.integration.config.reports
                ).to.exist;
                expect(
                    this.integrationManagerInstance.integration.config.reports[
                        this.report1.id
                    ]
                ).to.exist;
                expect(
                    this.integrationManagerInstance.integration.config.reports[
                        this.report2.id
                    ]
                ).to.exist;
            });

            it('Should sync the second report data over', async () => {
                const reportData =
                    await this.integrationManagerInstance.primaryInstance.listAllReportData(
                        this.report2.id
                    );
                const finalReportData = {
                    items: reportData,
                    report_id: this.report2.id,
                };
                const res = await this.integrationManagerInstance.notify(
                    'NEW_REPORT_DATA',
                    finalReportData
                );
            });
            it('Should update the integration just the second returned report', async () => {
                const config = {
                    reports: [{ id: this.report2.id, name: this.report2.name }],
                };

                const thirdUpdate =
                    await await this.integrationManagerInstance.processUpdate({
                        config,
                    });
                expect(
                    this.integrationManagerInstance.integration.status
                ).to.equal('ENABLED');
                expect(
                    this.integrationManagerInstance.integration.config.reports
                ).to.exist;
                expect(
                    this.integrationManagerInstance.integration.config.reports[
                        this.report1.id
                    ]
                ).to.not.exist;
                expect(
                    this.integrationManagerInstance.integration.config.reports[
                        this.report2.id
                    ]
                ).to.exist;
            });

            it('Should update the integration with no reports', async () => {
                const config = {
                    reports: [],
                };

                const update =
                    await await this.integrationManagerInstance.processUpdate({
                        config,
                    });
                expect(
                    this.integrationManagerInstance.integration.status
                ).to.equal('ENABLED');
                expect(
                    this.integrationManagerInstance.integration.config.reports
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
                    await this.integrationManagerInstance.processUpdate({
                        config: testConfig,
                    });
                expect(
                    this.integrationManagerInstance.integration.status
                ).to.equal('ENABLED');
                expect(
                    this.integrationManagerInstance.integration.config.boards
                ).to.exist;
            });
        });
    });

    describe('Test IntegrationManager Functions', async () => {
        it('Tests NEW_ACCOUNT_DATA notification', async () => {
            const partnerAccountData =
                await this.integrationManagerInstance.primaryInstance.listAllPartnerRecords();
            const res = await this.integrationManagerInstance.notify(
                'NEW_PARTNER_DATA',
                partnerAccountData
            );
        });
    });

    it('Should run ', async () => {});
});
