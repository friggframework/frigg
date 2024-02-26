const { Credential: Parent } = require('@friggframework/core-rollup');
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    // Clyde Access Details
    clientKey: {
        type: String,
        trim: true,
        unique: true,
    },
    secret: {
        type: String,
        trim: true,
        lhEncrypt: true,
    },
});

const name = 'ClydeCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
