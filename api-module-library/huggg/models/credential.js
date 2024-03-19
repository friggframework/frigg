const { Credential: Parent } = require('@friggframework/core');
const mongoose = require('mongoose');

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
});

const name = 'HugggCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
