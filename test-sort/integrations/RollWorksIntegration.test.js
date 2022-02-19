/**
 * @group interactive
 */

require('../../utils/TestUtils');
const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

chai.use(sinonChai);

chai.use(require('chai-url'));

const Authenticator = require('../../utils/Authenticator');
const IntegrationFactory = require('../../../src/managers/integrations/IntegrationManager');
const TargetEntityManager = require('../../../src/managers/entities/RollWorksManager');
const PrimaryEntityManager = require('../../../src/managers/entities/CrossbeamManager');
const { Integration } = require('@friggframework/models');
const TestUtils = require('../../utils/TestUtils');
const RollWorksQueuer = require('../../../src/workers/crons/RollWorksQueuer');
const QueuerUtil = require('../../../src/utils/QueuerUtil');

const testSecretAndId = {
    client_id: process.env.CROSSBEAM_TEST_CLIENT_ID,
    client_secret: process.env.CROSSBEAM_TEST_CLIENT_SECRET,
};

describe.skip('RollWorks Integration Manager', () => {
    const sandbox = sinon.createSandbox();

    beforeAll(async () => {
        this.userManager = await TestUtils.getLoggedInTestUserManagerInstance();
        this.targetEntityManager = await TargetEntityManager.getInstance({
            userId: this.userManager.getUserId(),
        });
        this.primaryEntityManager = await PrimaryEntityManager.getInstance({
            userId: this.userManager.getUserId(),
            subType: 'rollworks',
        });
    });

    afterAll(async () => {
        sandbox.restore();
        await this.integrationManagerInstance.processDelete();
        await IntegrationFactory.deleteIntegrationForUserById(
            this.userManager.getUserId(),
            this.integrationManagerInstance.integration.id
        );
    });

    describe('RollWorks Authentication Requests', () => {
        let testContext;

        beforeEach(() => {
            testContext = {};
        });

        let authorizeUrl;
        it('Should return Auth Requirements', async () => {
            const res =
                await testContext.targetEntityManager.getAuthorizationRequirements();

            chai.assert.hasAllKeys(res, ['url', 'type']);
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

        beforeEach(() => {
            testContext = {};
        });

        it('Should processAuthorizationCallback and return cred and entity ids', async () => {
            const data = {
                credentialType: 'rollworks',
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

        beforeEach(() => {
            testContext = {};
        });

        it('Should Take the entities and create an integration', async () => {
            const entities = [
                testContext.primaryEntityId,
                testContext.targetEntityId,
            ];
            const config = {
                type: 'rollworks',
            };
            testContext.integrationManagerInstance =
                await IntegrationFactory.createIntegration(
                    entities,
                    testContext.userManager.getUserId(),
                    config
                );
            // TODO Ask Sean
            await testContext.integrationManagerInstance.processCreate();
            expect(
                testContext.integrationManagerInstance.integration.status
            ).to.equal('NEEDS_CONFIG');
        });
    });

    describe('Integration Updated', () => {
        let testContext;

        beforeEach(() => {
            testContext = {};
        });

        describe('Currently NEEDS_CONFIG', () => {
            it('Updates to enabled if advertisable and reports are present', async () => {
                const entities = [
                    testContext.primaryEntityId,
                    testContext.targetEntityId,
                ];
                const config = {
                    type: 'rollworks',
                    advertisable_eid: 'test_eid',
                    reports: [{ id: 'test', name: 'name' }],
                };
                testContext.integrationManagerInstance =
                    await IntegrationFactory.createIntegration(
                        entities,
                        testContext.userManager.getUserId(),
                        config
                    );

                sandbox.spy(testContext.integrationManagerInstance);
                const queueSpy = sandbox.spy(RollWorksQueuer.prototype);
                sandbox.stub(QueuerUtil.prototype, 'enqueue').returns('Test');

                await testContext.integrationManagerInstance.processCreate();
                expect(
                    testContext.integrationManagerInstance.integration.status
                ).to.equal('NEEDS_CONFIG');
                await testContext.integrationManagerInstance.processUpdate({
                    config,
                });

                chai.assert(
                    testContext.integrationManagerInstance.firstSync.calledOnce
                );
                chai.assert(queueSpy.runOne.calledOnce);

                const updatedIntegrationMO = new Integration();
                const updatedIntegration = await updatedIntegrationMO.get(
                    testContext.integrationManagerInstance.integration.id
                );
                expect(updatedIntegration.status).to.equal('ENABLED');
                expect(updatedIntegration.config.advertisable_eid).to.equal(
                    'test_eid'
                );
                chai.assert.hasAllKeys(updatedIntegration.config.reports, [
                    'test',
                ]);

                sandbox.restore();
            });
            it('Updates setting but does not mark enabled with just reports', async () => {
                const entities = [
                    testContext.primaryEntityId,
                    testContext.targetEntityId,
                ];
                const config = {
                    type: 'rollworks',
                    reports: [{ id: 'test', name: 'name' }],
                };
                testContext.integrationManagerInstance =
                    await IntegrationFactory.createIntegration(
                        entities,
                        testContext.userManager.getUserId(),
                        config
                    );
                // TODO Ask Sean
                const updatedConfig = {
                    type: 'rollworks',
                    reports: [
                        { id: 'new_report', name: 'tester', fake: 'fake' },
                    ],
                };
                sandbox.spy(testContext.integrationManagerInstance);

                await testContext.integrationManagerInstance.processCreate();
                expect(
                    testContext.integrationManagerInstance.integration.status
                ).to.equal('NEEDS_CONFIG');
                await testContext.integrationManagerInstance.processUpdate({
                    config: updatedConfig,
                });

                chai.assert(
                    testContext.integrationManagerInstance.firstSync.notCalled
                );
                const updatedIntegrationMO = new Integration();
                const updatedIntegration = await updatedIntegrationMO.get(
                    testContext.integrationManagerInstance.integration.id
                );
                expect(updatedIntegration.status).to.equal('NEEDS_CONFIG');
                expect(updatedIntegration.config.advertisable_eid).to.equal(
                    null
                );
                chai.assert.hasAllKeys(updatedIntegration.config.reports, [
                    'new_report',
                ]);
                updatedIntegration.config.reports.new_report.should.not.have.property(
                    'fake',
                    'fake'
                );
                updatedIntegration.config.reports.new_report.should.have.property(
                    'name',
                    'tester'
                );

                sandbox.restore();
            });
            it('Updates setting but does not mark enabled with just advertisable', async () => {
                const entities = [
                    testContext.primaryEntityId,
                    testContext.targetEntityId,
                ];
                const config = {
                    type: 'rollworks',
                    advertisable_eid: 'test_eid',
                };
                testContext.integrationManagerInstance =
                    await IntegrationFactory.createIntegration(
                        entities,
                        testContext.userManager.getUserId(),
                        config
                    );

                sandbox.spy(testContext.integrationManagerInstance);
                // TODO Ask Sean
                await testContext.integrationManagerInstance.processCreate();
                expect(
                    testContext.integrationManagerInstance.integration.status
                ).to.equal('NEEDS_CONFIG');
                await testContext.integrationManagerInstance.processUpdate({
                    config,
                });
                chai.assert(
                    testContext.integrationManagerInstance.firstSync.notCalled
                );
                const updatedIntegrationMO = new Integration();
                const updatedIntegration = await updatedIntegrationMO.get(
                    testContext.integrationManagerInstance.integration.id
                );
                expect(updatedIntegration.status).to.equal('NEEDS_CONFIG');
                expect(updatedIntegration.config.advertisable_eid).to.equal(
                    'test_eid'
                );
                expect(updatedIntegration.config.reports).to.equal(null);
                sandbox.restore();
            });
        });
        describe('Currently ENABLED', () => {
            it('Updates Config with no status change', async () => {
                const entities = [
                    testContext.primaryEntityId,
                    testContext.targetEntityId,
                ];
                const config = {
                    type: 'rollworks',
                    advertisable_eid: 'test_eid',
                    reports: [{ id: 'test', name: 'name' }],
                };
                testContext.integrationManagerInstance =
                    await IntegrationFactory.createIntegration(
                        entities,
                        testContext.userManager.getUserId(),
                        config
                    );
                sandbox.spy(testContext.integrationManagerInstance);
                // TODO Ask Sean
                const updatedConfig = {
                    type: 'rollworks',
                    advertisable_eid: 'alt_eid',
                    reports: [{ id: 'new_report', name: 'name' }],
                };
                await testContext.integrationManagerInstance.processUpdate({
                    config: updatedConfig,
                });
                chai.assert(
                    testContext.integrationManagerInstance.firstSync.notCalled
                );
                const updatedIntegrationMO = new Integration();
                const updatedIntegration = await updatedIntegrationMO.get(
                    testContext.integrationManagerInstance.integration.id
                );
                expect(updatedIntegration.status).to.equal('ENABLED');
                expect(updatedIntegration.config.advertisable_eid).to.equal(
                    'alt_eid'
                );
                chai.assert.hasAllKeys(updatedIntegration.config.reports, [
                    'new_report',
                ]);
                sandbox.restore();
            });
            it('Marks as NEEDS_CONFIG with just reports', async () => {
                const entities = [
                    testContext.primaryEntityId,
                    testContext.targetEntityId,
                ];
                const config = {
                    type: 'rollworks',
                    advertisable_eid: 'test_eid',
                    reports: [{ id: 'test', name: 'name' }],
                };
                testContext.integrationManagerInstance =
                    await IntegrationFactory.createIntegration(
                        entities,
                        testContext.userManager.getUserId(),
                        config
                    );
                // TODO Ask Sean
                const updatedConfig = {
                    type: 'rollworks',
                    advertisable_eid: '',
                    reports: [{ id: 'new_report', name: 'name' }],
                };
                sandbox.spy(testContext.integrationManagerInstance);
                await testContext.integrationManagerInstance.processUpdate({
                    config: updatedConfig,
                });
                chai.assert(
                    testContext.integrationManagerInstance.firstSync.notCalled
                );
                const updatedIntegrationMO = new Integration();
                const updatedIntegration = await updatedIntegrationMO.get(
                    testContext.integrationManagerInstance.integration.id
                );
                expect(updatedIntegration.config.advertisable_eid).to.equal(
                    null
                );
                chai.assert.hasAllKeys(updatedIntegration.config.reports, [
                    'new_report',
                ]);
                expect(updatedIntegration.status).to.equal('NEEDS_CONFIG');
                sandbox.restore();
            });
            it('Marks as NEEDS_CONFIG with just advertisable', async () => {
                const entities = [
                    testContext.primaryEntityId,
                    testContext.targetEntityId,
                ];
                const config = {
                    type: 'rollworks',
                    advertisable_eid: 'test_eid',
                    reports: [{ id: 'test', name: 'name' }],
                };
                testContext.integrationManagerInstance =
                    await IntegrationFactory.createIntegration(
                        entities,
                        testContext.userManager.getUserId(),
                        config
                    );
                // TODO Ask Sean
                const updatedConfig = {
                    type: 'rollworks',
                    advertisable_eid: 'alt_eid',
                    reports: {},
                };
                sandbox.spy(testContext.integrationManagerInstance);
                await testContext.integrationManagerInstance.processUpdate({
                    config: updatedConfig,
                });
                chai.assert(
                    testContext.integrationManagerInstance.firstSync.notCalled
                );
                const updatedIntegrationMO = new Integration();
                const updatedIntegration = await updatedIntegrationMO.get(
                    testContext.integrationManagerInstance.integration.id
                );
                expect(updatedIntegration.status).to.equal('NEEDS_CONFIG');
                expect(updatedIntegration.config.advertisable_eid).to.equal(
                    'alt_eid'
                );
                expect(updatedIntegration.config.reports).to.equal(null);
                sandbox.restore();
            });
        });
    });

    describe('Test IntegrationManager Functions', () => {
        let testContext;

        beforeEach(() => {
            testContext = {};
        });

        describe('NEW_REPORT_DATA notification', () => {
            it('with bad id', async () => {
                const fakeData = {
                    report_id: 'notintheconfig',
                    items: [
                        {
                            population_ids: [120],
                            data: [
                                { value: 'Netchex' },
                                {
                                    value: 'https://www.netchexonline.com/asdfjahsd',
                                },
                                { value: 'notnetchexonline.com' },
                            ],
                        },
                        {
                            population_ids: [120],
                            data: [
                                { value: 'Netchex' },
                                {
                                    value: 'https://wwwfonetchexonlinecom/asdfjahsd',
                                },
                                { value: 'stnotnetchexonline.com' },
                            ],
                        },
                        {
                            population_ids: [120],
                            data: [
                                { value: 'Netchex' },
                                { value: 'https://fonetchexonline/asdfjahsd' },
                                { value: 'stnotnetchexonline' },
                            ],
                        },
                    ],
                };
                sandbox.spy(testContext.integrationManagerInstance);
                const res = await testContext.integrationManagerInstance.notify(
                    'NEW_REPORT_DATA',
                    fakeData
                );
                expect(res).to.be.undefined;
                chai.assert(
                    testContext.integrationManagerInstance.syncReportToRollWorks
                        .calledOnce
                );
                sandbox.restore();
            });
            it('with new id', async () => {
                const fakeData = {
                    report_id: '123456',
                    items: [
                        {
                            population_ids: [120],
                            data: [
                                { value: 'Netchex' },
                                {
                                    value: 'https://www.netchexonline.com/asdfjahsd',
                                },
                                { value: 'notnetchexonline.com' },
                            ],
                        },
                        {
                            population_ids: [120],
                            data: [
                                { value: 'Netchex' },
                                {
                                    value: 'https://wwwfonetchexonlinecom/asdfjahsd',
                                },
                                { value: 'stnotnetchexonline.com' },
                            ],
                        },
                        {
                            population_ids: [120],
                            data: [
                                { value: 'Netchex' },
                                { value: 'https://fonetchexonline/asdfjahsd' },
                                { value: 'stnotnetchexonline' },
                            ],
                        },
                    ],
                };
                const updatedConfig = {
                    advertisable_eid: 'alt_eid',
                    reports: [{ id: '123456', name: 'tester' }],
                };
                sandbox
                    .stub(testContext.integrationManagerInstance, 'firstSync')
                    .returns({});
                await testContext.integrationManagerInstance.processUpdate({
                    config: updatedConfig,
                });
                sandbox.restore();

                const { api } =
                    testContext.integrationManagerInstance.targetInstance;
                sandbox.spy(testContext.integrationManagerInstance);
                sandbox
                    .stub(api, 'createTargetAccount')
                    .returns({ eid: 'RollWorks EID', name: 'RollWorks Name' });

                const res = await testContext.integrationManagerInstance.notify(
                    'NEW_REPORT_DATA',
                    fakeData
                );

                expect(res).to.be.undefined;
                chai.assert(
                    testContext.integrationManagerInstance.syncReportToRollWorks
                        .calledOnce
                );
                chai.assert(
                    testContext.integrationManagerInstance.createAndSync
                        .calledOnce
                );
                chai.assert(api.createTargetAccount.calledOnce);

                const updatedIntegrationMO = new Integration();
                const updatedIntegration = await updatedIntegrationMO.get(
                    testContext.integrationManagerInstance.integration.id
                );

                chai.assert.hasAllKeys(updatedIntegration.config.reports, [
                    '123456',
                ]);
                updatedIntegration.config.reports[
                    '123456'
                ].should.have.property('name', 'tester');
                updatedIntegration.config.reports[
                    '123456'
                ].should.have.property(
                    'rollworksTargetAccountListId',
                    'RollWorks EID'
                );
                updatedIntegration.config.reports[
                    '123456'
                ].should.have.property(
                    'rollworksTargetAccountListName',
                    'RollWorks Name'
                );

                sandbox.restore();
            });
            it('with existing id', async () => {
                const fakeData = {
                    report_id: '123456',
                    items: [
                        {
                            population_ids: [120],
                            data: [
                                { value: 'Netchex' },
                                {
                                    value: 'https://www.netchexonline.com/asdfjahsd',
                                },
                                { value: 'notnetchexonline.com' },
                            ],
                        },
                        {
                            population_ids: [120],
                            data: [
                                { value: 'Netchex' },
                                {
                                    value: 'https://wwwfonetchexonlinecom/asdfjahsd',
                                },
                                { value: 'stnotnetchexonline.com' },
                            ],
                        },
                        {
                            population_ids: [120],
                            data: [
                                { value: 'Netchex' },
                                { value: 'https://fonetchexonline/asdfjahsd' },
                                { value: 'stnotnetchexonline' },
                            ],
                        },
                    ],
                };
                const updatedConfig = {
                    advertisable_eid: 'alt_eid',
                    reports: {
                        123456: {
                            name: 'tester',
                            rollworksTargetAccountListId: 'test_eid',
                        },
                    },
                };
                testContext.integrationManagerInstance.integration.config.advertisable_eid =
                    'alt_eid';
                testContext.integrationManagerInstance.integration.config.reports =
                    {
                        123456: {
                            name: 'tester',
                            rollworksTargetAccountListId: 'test_eid',
                        },
                    };
                testContext.integrationManagerInstance.integration.markModified(
                    'config'
                );
                testContext.integrationManagerInstance.integration.save();

                const { api } =
                    testContext.integrationManagerInstance.targetInstance;
                sandbox.spy(testContext.integrationManagerInstance);
                sandbox.stub(api, 'populateTargetAccount').returns({});

                const res = await testContext.integrationManagerInstance.notify(
                    'NEW_REPORT_DATA',
                    fakeData
                );

                expect(res).to.be.undefined;
                chai.assert(
                    testContext.integrationManagerInstance.syncReportToRollWorks
                        .calledOnce
                );
                chai.assert(
                    testContext.integrationManagerInstance.syncDomains
                        .calledOnce
                );
                chai.assert(api.populateTargetAccount.calledOnce);

                const updatedIntegrationMO = new Integration();
                const updatedIntegration = await updatedIntegrationMO.get(
                    testContext.integrationManagerInstance.integration.id
                );

                chai.assert.hasAllKeys(updatedIntegration.config.reports, [
                    '123456',
                ]);
                updatedIntegration.config.reports[
                    '123456'
                ].should.have.property('name', 'tester');
                updatedIntegration.config.reports[
                    '123456'
                ].should.have.property(
                    'rollworksTargetAccountListId',
                    'test_eid'
                );

                sandbox.restore();
            });
        });
    });

    describe('Test IntegrationManager domain Process', () => {
        let testContext;

        beforeEach(() => {
            testContext = {};
        });

        it('extractDomain common iterations', async () => {
            expect(
                testContext.integrationManagerInstance.extractDomain(
                    'https://www.test.com'
                )
            ).to.equal('test.com');
            expect(
                testContext.integrationManagerInstance.extractDomain('wonka')
            ).to.equal(null);
            expect(
                testContext.integrationManagerInstance.extractDomain(
                    'wonka@test.com'
                )
            ).to.equal('test.com');
            expect(
                testContext.integrationManagerInstance.extractDomain(
                    'http://www.test.com'
                )
            ).to.equal('test.com');
            expect(
                testContext.integrationManagerInstance.extractDomain(
                    'www.test.com'
                )
            ).to.equal('test.com');
            expect(
                testContext.integrationManagerInstance.extractDomain('test.com')
            ).to.equal('test.com');
            expect(
                testContext.integrationManagerInstance.extractDomain(
                    'https://www.test.com/tester/ers'
                )
            ).to.equal('test.com');
            expect(
                testContext.integrationManagerInstance.extractDomain(
                    'http://www.test.com/tester/ers'
                )
            ).to.equal('test.com');
            expect(
                testContext.integrationManagerInstance.extractDomain(
                    'www.test.com/tester/ers'
                )
            ).to.equal('test.com');
            expect(
                testContext.integrationManagerInstance.extractDomain(
                    'test.com/tester/ers'
                )
            ).to.equal('test.com');
            expect(
                testContext.integrationManagerInstance.extractDomain(
                    'https://www.test.co'
                )
            ).to.equal('test.co');
            expect(
                testContext.integrationManagerInstance.extractDomain(
                    'http://www.test.co'
                )
            ).to.equal('test.co');
            expect(
                testContext.integrationManagerInstance.extractDomain(
                    'www.test.co'
                )
            ).to.equal('test.co');
            expect(
                testContext.integrationManagerInstance.extractDomain('test.co')
            ).to.equal('test.co');
            expect(
                testContext.integrationManagerInstance.extractDomain(
                    'https://www.test.co/tester/ers'
                )
            ).to.equal('test.co');
            expect(
                testContext.integrationManagerInstance.extractDomain(
                    'http://www.test.co/tester/ers'
                )
            ).to.equal('test.co');
            expect(
                testContext.integrationManagerInstance.extractDomain(
                    'www.test.co/tester/ers'
                )
            ).to.equal('test.co');
            expect(
                testContext.integrationManagerInstance.extractDomain(
                    'test.co/tester/ers'
                )
            ).to.equal('test.co');
        });

        it('generateDomains examples', async () => {
            const fakeData = {
                items: [
                    {
                        population_ids: [120],
                        data: [
                            { value: 'Netchex' },
                            {
                                value: 'https://www.netchexonline.com/asdfjahsd',
                            },
                            { value: 'notnetchexonline.com' },
                        ],
                    },
                    {
                        population_ids: [120],
                        data: [
                            { value: 'Netchex' },
                            {
                                value: 'https://wwwfonetchexonlinecom/asdfjahsd',
                            },
                            { value: 'stnotnetchexonline.com' },
                        ],
                    },
                    {
                        population_ids: [120],
                        data: [
                            { value: 'Netchex' },
                            { value: 'https://fonetchexonline/asdfjahsd' },
                            { value: 'stnotnetchexonline' },
                        ],
                    },
                ],
            };
            expect(
                await testContext.integrationManagerInstance.generateDomains(
                    fakeData
                )
            ).to.eql(['netchexonline.com', 'stnotnetchexonline.com']);
        });
    });
});
