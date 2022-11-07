const mongoose = require('mongoose');
const { Credential: Parent } = require('@friggframework/module-plugin');

const schema = new mongoose.Schema({
    accountKey: {
        type: String,
        trim: true,
        lhEncrypt: true,
    },
});

const name = 'ClubworxCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
