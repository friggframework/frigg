const { Credential: Parent } = require('@friggframework/core-rollup');
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    apiKey: {
        type: String,
        trim: true,
        lhEncrypt: true,
    },
    subdomain: {
        type: String,
        trim: true,
    },
});

const name = 'IroncladCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
