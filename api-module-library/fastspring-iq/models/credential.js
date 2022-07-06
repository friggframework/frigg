const mongoose = require('mongoose');
const { Credential: Parent } = require('@friggframework/module-plugin');

const schema = new mongoose.Schema({
    accessToken: { type: String, lhEncrypt: true },
    refreshToken: { type: String, lhEncrypt: true },
    accessTokenExpire: { type: String },
    refreshTokenExpire: { type: String },
});

const name = 'FastSpringIQCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
