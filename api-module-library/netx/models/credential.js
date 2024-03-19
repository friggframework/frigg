const { Credential: Parent } = require('@friggframework/core');
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    access_token: {
        type: String,
        trim: true,
        lhEncrypt: true,
    },
});

const name = 'NetXCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
