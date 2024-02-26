const { Credential: Parent } = require('@friggframework/core-rollup');
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    api_key: {
        type: String,
        trim: true,
        lhEncrypt: true,
    },
    api_url: {
        type: String,
        required: true,
    },
});
const name = 'ActiveCampaignCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
