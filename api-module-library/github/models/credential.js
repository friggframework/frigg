const mongoose = require('mongoose');
const { Credential: Parent } = require('@friggframework/module-plugin');
const schema = new mongoose.Schema({
    access_token: {
        type: String,
        trim: true,
        lhEncrypt: true,
    },
    token_type: {
        type: String,
        trim: true,
    },
    scope: {
        type: String,
        trim: true,
    },
});
const name = 'GithubCredential';
const Credential = Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
