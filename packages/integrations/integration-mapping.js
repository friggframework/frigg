const mongoose = require('mongoose');
const { Encrypt } = require('@friggframework/encrypt');

const schema = new mongoose.Schema(
    {
        integration: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Integration',
            required: true,
        },
        sourceId: { type: String }, // Used for lookups
        mapping: {}
    },
    { timestamps: true }
);

schema.plugin(Encrypt);

schema.static({
    findBy: async function (integrationId, sourceId) {
        const mappings = await this.find({ integration: integrationId, sourceId });
        if (mappings.length === 0) {
            return null;
        } else if (mappings.length === 1) {
            return mappings[0].mapping;
        } else {
            throw new Error('multiple integration mappings with same sourceId');
        }
    },
    upsert: async function (filter, obj) {
        return this.findOneAndUpdate(filter, obj, {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
        });
    },
});

schema.index({ integration: 1, sourceId: 1 });

const IntegrationMapping =
    mongoose.models.IntegrationMapping || mongoose.model('IntegrationMapping', schema);
module.exports = { IntegrationMapping };
