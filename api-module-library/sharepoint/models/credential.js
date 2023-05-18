const mongoose = require('mongoose');
const { Credential: Parent } = require('@friggframework/module-plugin');

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
});

const name = 'MicrosoftSharePointCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
