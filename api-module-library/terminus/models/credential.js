const mongoose = require('mongoose');
const { Credential: Parent } = require('@friggframework/module-plugin');
const schema = new mongoose.Schema({
    apiKey: {
        type: String,
        trim: true,
        unique: true,
        lhEncrypt: true,
    },
});

const name = 'TerminusCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
