const { Credential: Parent } = require('@friggframework/core-rollup');
const mongoose = require('mongoose');
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
    expires_at: { type: Number },
});
const name = 'GoogleCalendarCredential';
const Credential = Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
