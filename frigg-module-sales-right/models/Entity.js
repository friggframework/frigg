const mongoose = require('mongoose');
const { Entity: Parent } = require('@friggframework/module-plugin');

const schema = new mongoose.Schema({
    credentials: [
        {
            credential: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Credential',
                required: false,
            },
            type: { type: String, required: true },
        },
    ],
    salesRightOrgName: { type: String },
});

schema.index(
    { user: 1 },
    { unique: true, partialFilterExpression: { __t: collectionName } }
);

const Entity = Parent.discriminator('salesrightEntity', schema);
module.exports = { Entity };
