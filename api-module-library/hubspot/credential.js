const mongoose = require('mongoose');
const { Credential: Parent } = require('@friggframework/module-plugin');

const schema = new mongoose.Schema({
    accessToken: {
        type: String,
        trim: true,
        lhEncrypt: true,
    },
    refreshToken: {
        type: String,
        trim: true,
        lhEncrypt: true,
    },
    accessTokenExpire: { type: Date },
    expires_at: { type: Date },
});

const Credential = Parent.discriminator('HubspotCredentials', schema);
module.exports = { Credential };
