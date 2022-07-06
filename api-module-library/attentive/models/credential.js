const mongoose = require('mongoose');
const { Credential: Parent } = require('@friggframework/module-plugin');

const schema = new mongoose.Schema({
    access_token: { type: String, trim: true, lhEncrypt: true },
    id_token: { type: String, trim: true, lhEncrypt: true },
    token_type: { type: String, default: 'Bearer' },
    expires_in: { type: Number },
});
const name = 'AttentiveCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
