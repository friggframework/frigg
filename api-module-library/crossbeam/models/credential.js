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
    auth_is_valid: { type: Boolean, default: true },
});

const Credential = Parent.discriminator('CrossbeamCredentials', schema);
module.exports = { Credential };
