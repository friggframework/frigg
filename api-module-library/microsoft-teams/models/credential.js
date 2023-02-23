'use strict';
const mongoose = require('mongoose');
const { Credential: Parent } = require('@friggframework/module-plugin');

const schema = new mongoose.Schema({
    graph_access_token: { type: String, trim: true, lhEncrypt: true },
    bot_access_token: { type: String, trim: true, lhEncrypt: true }
});

const name = 'MicrosoftTeamsCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
