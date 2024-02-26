const { Credential: Parent } = require('@friggframework/core-rollup');
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    accessToken: {
        type: String,
        required: true,
        lhEncrypt: true,
    },
    refreshToken: {
        type: String,
        required: true,
        lhEncrypt: true,
    },
    instanceUrl: { type: String, required: true },
});

const name = 'SalesforceCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
