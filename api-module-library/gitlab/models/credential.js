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
    token_type: {
        type: String,
        trim: true,
    },
    expires_in: {
        type: Number,
    },
    created_at: {
        type: Number,
    },
});
const name = 'GitlabCredential';
const Credential = Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
