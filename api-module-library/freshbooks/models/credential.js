const { Credential: Parent, mongoose } = require('@friggframework/core');
const { Schema } = mongoose;

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
