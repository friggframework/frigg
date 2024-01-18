const mongoose = require('mongoose');
const { Credential: Parent } = require('@friggframework/module-plugin');

const schema = new mongoose.Schema({
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
});

const name = 'HubspotCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
