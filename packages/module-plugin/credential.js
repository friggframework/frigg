const mongoose = require('mongoose');
const { Encrypt } = require('@friggframework/encrypt');

const schema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: false,
        },
        subType: { type: String },
        auth_is_valid: { type: Boolean },
        externalId: { type: String }, // Used for lookups, identifying the owner of the credential
    },
    { timestamps: true }
);

schema.plugin(Encrypt);

const Credential =
    mongoose.models.Credential || mongoose.model('Credential', schema);
module.exports = { Credential };
