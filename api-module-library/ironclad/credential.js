const mongoose = require('mongoose');
const { Credential: Parent } = require('@friggframework/module-plugin');

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

const name = 'IroncladCredential';
const Credential = Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
