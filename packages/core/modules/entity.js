const { mongoose } = require('../database/mongoose');
const schema = new mongoose.Schema(
    {
        credential: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Credential',
            required: false,
        },
        subType: { type: String },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: false,
        },
        name: { type: String },
        moduleName: { type: String },
        externalId: { type: String },
    },
    { timestamps: true }
);

schema.static({
    findByUserId: async function (userId) {
        const entities = await this.find({ user: userId });
        if (entities.length === 0) {
            return null;
        } else if (entities.length === 1) {
            return entities[0];
        } else {
            throw new Error('multiple entities with same userId');
        }
    },
    findAllByUserId(userId) {
        return this.find({ user: userId });
    },
    upsert: async function (filter, obj) {
        return this.findOneAndUpdate(filter, obj, {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
        });
    },
});

const Entity = mongoose.models.Entity || mongoose.model('Entity', schema);

module.exports = { Entity };
