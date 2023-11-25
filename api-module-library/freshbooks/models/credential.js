const { mongoose } = require('@friggframework/database/mongoose');
const { Schema } = mongoose;
const { Credential: Parent } = require('@friggframework/module-plugin');

const schema = new Schema({
    access_token: {
        type: String,
        trim: true,
        lhEncrypt: true,
    },
    refresh_token: {
        type: String,
        trim: true,
        lhEncrypt: true,
    },
    access_token_expire: { type: Date },
    expires_at: { type: Date },
    externalId: { type: String },
});

const name = 'FreshbooksCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
