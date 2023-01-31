const mongoose = require('mongoose');
const { Credential: Parent } = require('@friggframework/module-plugin');

const schema = new mongoose.Schema({
    access_token: {
        type: String,
        trim: true,
        lhEncrypt: true,
    },
    appKey: {
        type: String,
        trim: true,
    },
    store_id: {
        type: String,
    },
    secret: {
        type: String,
    },
    coreApiAccessToken: {
        type: String,
        trim: true,
        lhEncrypt: true,
    },
    loyalty_api_key: {
        type: String,
        trim: true,
        lhEncrypt: true,
    },
    loyalty_guid: {
        type: String,
        trim: true,
    },
});

const name = 'YotpoCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
