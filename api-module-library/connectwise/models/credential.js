const mongoose = require('mongoose');
const { Credential: Parent } = require('@friggframework/module-plugin');

const schema = new mongoose.Schema({
    public_key: {
        type: String,
        required: true,
        lhEncrypt: true,
    },
    private_key: {
        type: String,
        required: true,
        lhEncrypt: true,
    },
    company_id: { type: String, required: true, unique: true },
    site: { type: String, required: true },
});

const name = 'ConnectWiseCredential';
const Credential =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
