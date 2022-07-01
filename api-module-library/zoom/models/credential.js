'use strict';
const mongoose = require('mongoose');
const { Credential: Parent } = require('@friggframework/module-plugin');

const schema = new mongoose.Schema({
    access_token: { type: String, trim: true, lhEncrypt: true },
    refresh_token: { type: String, trim: true, lhEncrypt: true },
});

const Credential = Parent.discriminator('ZoomCredentials', schema);
module.exports = { Credential };
