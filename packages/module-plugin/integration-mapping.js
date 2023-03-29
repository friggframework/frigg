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

const IntegrationMapping =
    mongoose.models.IntegrationMapping || mongoose.model('IntegrationMapping', schema);
module.exports = { IntegrationMapping };
