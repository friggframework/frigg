const mongoose = require('mongoose');
const { cCredential: Parent } = require('@friggframework/module-plugin');

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

const Credential = Parent.discriminator('salesforceCredentials', schema)

module.exports = { Credential };
