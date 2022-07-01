const mongoose = require('mongoose');
const { Credential: Parent } = require('@friggframework/module-plugin');

const schema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true, lhEncrypt: true },
    client_code: { type: String, required: true, lhEncrypt: true },
});

const Credential = Parent.discriminator('RevioCredential', schema);
module.exports = { Credential };
