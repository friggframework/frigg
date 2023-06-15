const _ = require('lodash');
const mongoose = require('mongoose');
const { expect } = require('chai');
const {IntegrationManager} = require("../manager");
const {Credential, Entity} = require("@friggframework/module-plugin");
const { IntegrationMapping } = require('../integration-mapping')
const {Integration} = require("../model");

describe(`Should fully test the IntegrationManager`, () => {
    let integration;
    let userId;

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
        integration = await Integration.create({
            entities: [entity1, entity2],
            user: userId
        });
    });

    afterAll(async () => {
        await Entity.deleteMany();
        await Credential.deleteMany();
        await IntegrationMapping.deleteMany();
        await Integration.deleteMany();
        await mongoose.disconnect();
    });

    describe('getIntegrationMapping()', () => {
        it('should return null if not found', async () => {
            const mappings = await IntegrationManager.getIntegrationMapping(new mongoose.Types.ObjectId(), 'badId');
            expect(mappings).to.be.null;
        });

        it('should throw error if invalid integrationId', async () => {
            try {
                await IntegrationManager.getIntegrationMapping('badId', 'badId');
                fail('should have thrown error')
            } catch(err) {
                expect(err.message).to.contains('Cast to ObjectId');
            }
        });

        it('should return if valid ids', async () => {
            await IntegrationManager.upsertIntegrationMapping(integration._id, userId, 'validId', {});
            const mapping = await IntegrationManager.getIntegrationMapping(integration.id, 'validId');
            expect(mapping).to.eql({})
        });
    })

    describe('upsertIntegrationMapping()', () => {
        it('should throw error if integrationId does not match', async () => {
            const id = new mongoose.Types.ObjectId();
            try {
                await IntegrationManager.upsertIntegrationMapping(id, userId, 'validId', {});
                fail('should have thrown error')
            } catch(err) {
                expect(err.message).to.contain(`Integration with ID ${id} does not exist`);
            }
        });

        it('should throw error if user id does not match', async () => {
            try {
                await IntegrationManager.upsertIntegrationMapping(integration._id, new mongoose.Types.ObjectId(), 'validId', {});
                fail('should have thrown error')
            } catch(err) {
                expect(err.message).to.contain('the integration mapping does not belong to the user');
            }
        });

        it('should throw error if sourceId is null', async () => {
            try {
                await IntegrationManager.upsertIntegrationMapping(integration._id, userId, null, {});
                fail('should have thrown error')
            } catch(err) {
                expect(err.message).to.contain('sourceId must be set');
            }
        });

        it('should return for empty mapping', async () => {
            const mapping = await IntegrationManager.upsertIntegrationMapping(integration._id, userId, 'validId2', {});
            expect(_.pick(mapping, ['integration', 'sourceId', 'mapping'])).to.eql({
                integration: integration._id,
                sourceId: 'validId2',
                mapping: {}
            })
        });

        it('should return for filled mapping', async () => {
            const mapping = await IntegrationManager.upsertIntegrationMapping(integration._id, userId, 'validId3', {
                name: 'someName',
                value: 5
            });
            expect(_.pick(mapping, ['integration', 'sourceId', 'mapping'])).to.eql({
                integration: integration._id,
                sourceId: 'validId3',
                mapping: {
                    name: 'someName',
                    value: 5
                }
            })
        });

        it('should allow upserting to same id', async () => {
            await IntegrationManager.upsertIntegrationMapping(integration._id, userId, 'validId4', {});
            const mapping = await IntegrationManager.upsertIntegrationMapping(integration._id, userId, 'validId4', {
                name: 'trustMe',
                thisWorks: true,
            });
            expect(_.pick(mapping, ['integration', 'sourceId', 'mapping'])).to.eql({
                integration: integration._id,
                sourceId: 'validId4',
                mapping: {
                    name: 'trustMe',
                    thisWorks: true,
                }
            })
        });
    })

});
