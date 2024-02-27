const { Credential: Parent } = require('@friggframework/core');
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
const name = 'AirwallexCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
