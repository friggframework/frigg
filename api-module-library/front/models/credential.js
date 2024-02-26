const { Credential: Parent } = require('@friggframework/core-rollup');
'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    access_token: { type: String, trim: true, lhEncrypt: true },
    refresh_token: { type: String, trim: true, lhEncrypt: true },
    auth_is_valid: { type: Boolean, default: true },
});

const name = 'FrontCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
