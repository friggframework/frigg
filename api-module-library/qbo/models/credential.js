'use strict';
const mongoose = require('mongoose');
const { Credential: Parent } = require('@friggframework/module-plugin');

const schema = new mongoose.Schema({
    realmId: { type: String, required: true },
    accessToken: { type: String, trim: true, lhEncrypt: true },
    refreshToken: { type: String, trime: true, lhEncrypt: true },
    accessTokenExpire: { type: String },
    refreshTokenExpire: { type: String },
});

const name = 'QBOCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
