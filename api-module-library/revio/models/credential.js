const { Credential: Parent } = require('@friggframework/core');
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true, lhEncrypt: true },
    client_code: { type: String, required: true, lhEncrypt: true },
});

const name = 'RevioCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
