require('../../utils/TestUtils');
const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

chai.use(sinonChai);

const { expect } = chai;
const should = chai.should();
const chaiAsPromised = require('chai-as-promised');
chai.use(require('chai-url'));

chai.use(chaiAsPromised);

const Authenticator = require('../../utils/Authenticator');
const IntegrationFactory = require('../../../src/managers/integrations/IntegrationManager');
const TargetEntityManager = require('../../../src/managers/entities/RollWorksManager');
const PrimaryEntityManager = require('../../../src/managers/entities/CrossbeamManager');
const Integration = require('../../../src/base/models/Integration');
const TestUtils = require('../../utils/TestUtils');
const RollWorksQueuer = require('../../../src/workers/crons/RollWorksQueuer');
const QueuerUtil = require('../../../src/utils/QueuerUtil');

const testSecretAndId = {
    client_id: process.env.CROSSBEAM_TEST_CLIENT_ID,
    client_secret: process.env.CROSSBEAM_TEST_CLIENT_SECRET,
};

describe.skip('RollWorks Integration Manager', async () => {
    const sandbox = sinon.createSandbox();

    before(async () => {
        this.userManager = await TestUtils.getLoggedInTestUserManagerInstance();
        this.targetEntityManager = await TargetEntityManager.getInstance({
            userId: this.userManager.getUserId(),
        });
        this.primaryEntityManager = await PrimaryEntityManager.getInstance({
            userId: this.userManager.getUserId(),
            subType: 'rollworks',
        });
    });

    after(async () => {
        sandbox.restore();
        await this.integrationManagerInstance.processDelete();
        await IntegrationFactory.deleteIntegrationForUserById(
            this.userManager.getUserId(),
            this.integrationManagerInstance.integration.id
        );
    });

    describe('RollWorks Authentication Requests', async () => {
        let authorizeUrl;
        it('Should return Auth Requirements', async () => {
            const res =
                await this.targetEntityManager.getAuthorizationRequirements();

            chai.assert.hasAllKeys(res, ['url', 'type']);
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
                credentialType: 'rollworks',
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
                type: 'rollworks',
            };
            this.integrationManagerInstance =
                await IntegrationFactory.createIntegration(
                    entities,
                    this.userManager.getUserId(),
                    config
                );
            // TODO Ask Sean
            await this.integrationManagerInstance.processCreate();
            expect(this.integrationManagerInstance.integration.status).to.equal(
                'NEEDS_CONFIG'
            );
        });
    });

    describe('Integration Updated', async () => {
        describe('Currently NEEDS_CONFIG', async () => {
            it('Updates to enabled if advertisable and reports are present', async () => {
                const entities = [this.primaryEntityId, this.targetEntityId];
                const config = {
                    type: 'rollworks',
                    advertisable_eid: 'test_eid',
                    reports: [{ id: 'test', name: 'name' }],
                };
                this.integrationManagerInstance =
                    await IntegrationFactory.createIntegration(
                        entities,
                        this.userManager.getUserId(),
                        config
                    );

                sandbox.spy(this.integrationManagerInstance);
                const queueSpy = sandbox.spy(RollWorksQueuer.prototype);
                sandbox.stub(QueuerUtil.prototype, 'enqueue').returns('Test');

                await this.integrationManagerInstance.processCreate();
                expect(
                    this.integrationManagerInstance.integration.status
                ).to.equal('NEEDS_CONFIG');
                await this.integrationManagerInstance.processUpdate({ config });

                chai.assert(
                    this.integrationManagerInstance.firstSync.calledOnce
                );
                chai.assert(queueSpy.runOne.calledOnce);

                const updatedIntegrationMO = new Integration();
                const updatedIntegration = await updatedIntegrationMO.get(
                    this.integrationManagerInstance.integration.id
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
                const entities = [this.primaryEntityId, this.targetEntityId];
                const config = {
                    type: 'rollworks',
                    reports: [{ id: 'test', name: 'name' }],
                };
                this.integrationManagerInstance =
                    await IntegrationFactory.createIntegration(
                        entities,
                        this.userManager.getUserId(),
                        config
                    );
                // TODO Ask Sean
                const updatedConfig = {
                    type: 'rollworks',
                    reports: [
                        { id: 'new_report', name: 'tester', fake: 'fake' },
                    ],
                };
                sandbox.spy(this.integrationManagerInstance);

                await this.integrationManagerInstance.processCreate();
                expect(
                    this.integrationManagerInstance.integration.status
                ).to.equal('NEEDS_CONFIG');
                await this.integrationManagerInstance.processUpdate({
                    config: updatedConfig,
                });

                chai.assert(
                    this.integrationManagerInstance.firstSync.notCalled
                );
                const updatedIntegrationMO = new Integration();
                const updatedIntegration = await updatedIntegrationMO.get(
                    this.integrationManagerInstance.integration.id
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
                const entities = [this.primaryEntityId, this.targetEntityId];
                const config = {
                    type: 'rollworks',
                    advertisable_eid: 'test_eid',
                };
                this.integrationManagerInstance =
                    await IntegrationFactory.createIntegration(
                        entities,
                        this.userManager.getUserId(),
                        config
                    );

                sandbox.spy(this.integrationManagerInstance);
                // TODO Ask Sean
                await this.integrationManagerInstance.processCreate();
                expect(
                    this.integrationManagerInstance.integration.status
                ).to.equal('NEEDS_CONFIG');
                await this.integrationManagerInstance.processUpdate({ config });
                chai.assert(
                    this.integrationManagerInstance.firstSync.notCalled
                );
                const updatedIntegrationMO = new Integration();
                const updatedIntegration = await updatedIntegrationMO.get(
                    this.integrationManagerInstance.integration.id
                );
                expect(updatedIntegration.status).to.equal('NEEDS_CONFIG');
                expect(updatedIntegration.config.advertisable_eid).to.equal(
                    'test_eid'
                );
                expect(updatedIntegration.config.reports).to.equal(null);
                sandbox.restore();
            });
        });
        describe('Currently ENABLED', async () => {
            it('Updates Config with no status change', async () => {
                const entities = [this.primaryEntityId, this.targetEntityId];
                const config = {
                    type: 'rollworks',
                    advertisable_eid: 'test_eid',
                    reports: [{ id: 'test', name: 'name' }],
                };
                this.integrationManagerInstance =
                    await IntegrationFactory.createIntegration(
                        entities,
                        this.userManager.getUserId(),
                        config
                    );
                sandbox.spy(this.integrationManagerInstance);
                // TODO Ask Sean
                const updatedConfig = {
                    type: 'rollworks',
                    advertisable_eid: 'alt_eid',
                    reports: [{ id: 'new_report', name: 'name' }],
                };
                await this.integrationManagerInstance.processUpdate({
                    config: updatedConfig,
                });
                chai.assert(
                    this.integrationManagerInstance.firstSync.notCalled
                );
                const updatedIntegrationMO = new Integration();
                const updatedIntegration = await updatedIntegrationMO.get(
                    this.integrationManagerInstance.integration.id
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
                const entities = [this.primaryEntityId, this.targetEntityId];
                const config = {
                    type: 'rollworks',
                    advertisable_eid: 'test_eid',
                    reports: [{ id: 'test', name: 'name' }],
                };
                this.integrationManagerInstance =
                    await IntegrationFactory.createIntegration(
                        entities,
                        this.userManager.getUserId(),
                        config
                    );
                // TODO Ask Sean
                const updatedConfig = {
                    type: 'rollworks',
                    advertisable_eid: '',
                    reports: [{ id: 'new_report', name: 'name' }],
                };
                sandbox.spy(this.integrationManagerInstance);
                await this.integrationManagerInstance.processUpdate({
                    config: updatedConfig,
                });
                chai.assert(
                    this.integrationManagerInstance.firstSync.notCalled
                );
                const updatedIntegrationMO = new Integration();
                const updatedIntegration = await updatedIntegrationMO.get(
                    this.integrationManagerInstance.integration.id
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
                const entities = [this.primaryEntityId, this.targetEntityId];
                const config = {
                    type: 'rollworks',
                    advertisable_eid: 'test_eid',
                    reports: [{ id: 'test', name: 'name' }],
                };
                this.integrationManagerInstance =
                    await IntegrationFactory.createIntegration(
                        entities,
                        this.userManager.getUserId(),
                        config
                    );
                // TODO Ask Sean
                const updatedConfig = {
                    type: 'rollworks',
                    advertisable_eid: 'alt_eid',
                    reports: {},
                };
                sandbox.spy(this.integrationManagerInstance);
                await this.integrationManagerInstance.processUpdate({
                    config: updatedConfig,
                });
                chai.assert(
                    this.integrationManagerInstance.firstSync.notCalled
                );
                const updatedIntegrationMO = new Integration();
                const updatedIntegration = await updatedIntegrationMO.get(
                    this.integrationManagerInstance.integration.id
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

    describe('Test IntegrationManager Functions', async () => {
        describe('NEW_REPORT_DATA notification', async () => {
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
                sandbox.spy(this.integrationManagerInstance);
                const res = await this.integrationManagerInstance.notify(
                    'NEW_REPORT_DATA',
                    fakeData
                );
                expect(res).to.be.undefined;
                chai.assert(
                    this.integrationManagerInstance.syncReportToRollWorks
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
                    .stub(this.integrationManagerInstance, 'firstSync')
                    .returns({});
                await this.integrationManagerInstance.processUpdate({
                    config: updatedConfig,
                });
                sandbox.restore();

                const { api } = this.integrationManagerInstance.targetInstance;
                sandbox.spy(this.integrationManagerInstance);
                sandbox
                    .stub(api, 'createTargetAccount')
                    .returns({ eid: 'RollWorks EID', name: 'RollWorks Name' });

                const res = await this.integrationManagerInstance.notify(
                    'NEW_REPORT_DATA',
                    fakeData
                );

                expect(res).to.be.undefined;
                chai.assert(
                    this.integrationManagerInstance.syncReportToRollWorks
                        .calledOnce
                );
                chai.assert(
                    this.integrationManagerInstance.createAndSync.calledOnce
                );
                chai.assert(api.createTargetAccount.calledOnce);

                const updatedIntegrationMO = new Integration();
                const updatedIntegration = await updatedIntegrationMO.get(
                    this.integrationManagerInstance.integration.id
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
                this.integrationManagerInstance.integration.config.advertisable_eid =
                    'alt_eid';
                this.integrationManagerInstance.integration.config.reports = {
                    123456: {
                        name: 'tester',
                        rollworksTargetAccountListId: 'test_eid',
                    },
                };
                this.integrationManagerInstance.integration.markModified(
                    'config'
                );
                this.integrationManagerInstance.integration.save();

                const { api } = this.integrationManagerInstance.targetInstance;
                sandbox.spy(this.integrationManagerInstance);
                sandbox.stub(api, 'populateTargetAccount').returns({});

                const res = await this.integrationManagerInstance.notify(
                    'NEW_REPORT_DATA',
                    fakeData
                );

                expect(res).to.be.undefined;
                chai.assert(
                    this.integrationManagerInstance.syncReportToRollWorks
                        .calledOnce
                );
                chai.assert(
                    this.integrationManagerInstance.syncDomains.calledOnce
                );
                chai.assert(api.populateTargetAccount.calledOnce);

                const updatedIntegrationMO = new Integration();
                const updatedIntegration = await updatedIntegrationMO.get(
                    this.integrationManagerInstance.integration.id
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

    describe('Test IntegrationManager domain Process', async () => {
        it('extractDomain common iterations', async () => {
            expect(
                this.integrationManagerInstance.extractDomain(
                    'https://www.test.com'
                )
            ).to.equal('test.com');
            expect(
                this.integrationManagerInstance.extractDomain('wonka')
            ).to.equal(null);
            expect(
                this.integrationManagerInstance.extractDomain('wonka@test.com')
            ).to.equal('test.com');
            expect(
                this.integrationManagerInstance.extractDomain(
                    'http://www.test.com'
                )
            ).to.equal('test.com');
            expect(
                this.integrationManagerInstance.extractDomain('www.test.com')
            ).to.equal('test.com');
            expect(
                this.integrationManagerInstance.extractDomain('test.com')
            ).to.equal('test.com');
            expect(
                this.integrationManagerInstance.extractDomain(
                    'https://www.test.com/tester/ers'
                )
            ).to.equal('test.com');
            expect(
                this.integrationManagerInstance.extractDomain(
                    'http://www.test.com/tester/ers'
                )
            ).to.equal('test.com');
            expect(
                this.integrationManagerInstance.extractDomain(
                    'www.test.com/tester/ers'
                )
            ).to.equal('test.com');
            expect(
                this.integrationManagerInstance.extractDomain(
                    'test.com/tester/ers'
                )
            ).to.equal('test.com');
            expect(
                this.integrationManagerInstance.extractDomain(
                    'https://www.test.co'
                )
            ).to.equal('test.co');
            expect(
                this.integrationManagerInstance.extractDomain(
                    'http://www.test.co'
                )
            ).to.equal('test.co');
            expect(
                this.integrationManagerInstance.extractDomain('www.test.co')
            ).to.equal('test.co');
            expect(
                this.integrationManagerInstance.extractDomain('test.co')
            ).to.equal('test.co');
            expect(
                this.integrationManagerInstance.extractDomain(
                    'https://www.test.co/tester/ers'
                )
            ).to.equal('test.co');
            expect(
                this.integrationManagerInstance.extractDomain(
                    'http://www.test.co/tester/ers'
                )
            ).to.equal('test.co');
            expect(
                this.integrationManagerInstance.extractDomain(
                    'www.test.co/tester/ers'
                )
            ).to.equal('test.co');
            expect(
                this.integrationManagerInstance.extractDomain(
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
                await this.integrationManagerInstance.generateDomains(fakeData)
            ).to.eql(['netchexonline.com', 'stnotnetchexonline.com']);
        });
    });
});
