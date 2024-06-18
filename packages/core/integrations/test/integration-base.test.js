const _ = require('lodash');
const { mongoose } = require('../../database/mongoose');
const { expect } = require('chai');
const { IntegrationBase } = require("../integration-base");
const {Credential} = require('../../module-plugin/credential');
const {Entity} = require('../../module-plugin/entity');
const { IntegrationMapping } = require('../integration-mapping')
const {IntegrationModel} = require("../integration-model");

describe(`Should fully test the IntegrationBase Class`, () => {
    let integrationRecord;
    let userId;
    const integration = new IntegrationBase;

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGO_URI);
        userId = new mongoose.Types.ObjectId();
        const credential = await Credential.findOneAndUpdate(
            {
                user: this.userId,
            },
            { $set: { user: this.userId } },
            {
                new: true,
                upsert: true,
                setDefaultsOnInsert: true,
            }
        );
        const entity1 = await Entity.findOneAndUpdate(
            {
                user: this.userId,
            },
            {
                $set: {
                    credential: credential.id,
                    user: userId,
                },
            },
            {
                new: true,
                upsert: true,
                setDefaultsOnInsert: true,
            }
        );
        const entity2 = await Entity.findOneAndUpdate(
            {
                user: userId,
            },
            {
                $set: {
                    credential: credential.id,
                    user: userId,
                },
            },
            {
                new: true,
                upsert: true,
                setDefaultsOnInsert: true,
            }
        );
        integrationRecord = await IntegrationModel.create({
            entities: [entity1, entity2],
            user: userId
        });
        integration.record = integrationRecord;
    });

    afterAll(async () => {
        await Entity.deleteMany();
        await Credential.deleteMany();
        await IntegrationMapping.deleteMany();
        await IntegrationModel.deleteMany();
        await mongoose.disconnect();
    });

    beforeEach(() => {
        integration.record = integrationRecord;
    })

    describe('getIntegrationMapping()', () => {
        it('should return null if not found', async () => {
            const mappings = await integration.getMapping('badId');
            expect(mappings).to.be.null;
        });

        it('should return if valid ids', async () => {
            await integration.upsertMapping('validId', {});
            const mapping = await integration.getMapping('validId');
            expect(mapping).to.eql({})
        });
    })

    describe('upsertIntegrationMapping()', () => {
        it('should throw error if sourceId is null', async () => {
            try {
                await integration.upsertMapping( null, {});
                fail('should have thrown error')
            } catch(err) {
                expect(err.message).to.contain('sourceId must be set');
            }
        });

        it('should return for empty mapping', async () => {
            const mapping = await integration.upsertMapping( 'validId2', {});
            expect(_.pick(mapping, ['integration', 'sourceId', 'mapping'])).to.eql({
                integration: integrationRecord._id,
                sourceId: 'validId2',
                mapping: {}
            })
        });

        it('should return for filled mapping', async () => {
            const mapping = await integration.upsertMapping('validId3', {
                name: 'someName',
                value: 5
            });
            expect(_.pick(mapping, ['integration', 'sourceId', 'mapping'])).to.eql({
                integration: integrationRecord._id,
                sourceId: 'validId3',
                mapping: {
                    name: 'someName',
                    value: 5
                }
            })
        });

        it('should allow upserting to same id', async () => {
            await integration.upsertMapping('validId4', {});
            const mapping = await integration.upsertMapping('validId4', {
                name: 'trustMe',
                thisWorks: true,
            });
            expect(_.pick(mapping, ['integration', 'sourceId', 'mapping'])).to.eql({
                integration: integrationRecord._id,
                sourceId: 'validId4',
                mapping: {
                    name: 'trustMe',
                    thisWorks: true,
                }
            })
        });
    })

});
