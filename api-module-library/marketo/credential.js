const { Credential: Parent } = require('@friggframework/core');
'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    client_id: { type: String, trim: true },
    client_secret: { type: String, trim: true, lhEncrypt: true },
});

const name = 'MarketoCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
