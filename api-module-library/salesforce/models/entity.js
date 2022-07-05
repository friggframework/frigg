const mongoose = require('mongoose');
const { Entity: Parent } = require('@friggframework/module-plugin');

const schema = new mongoose.Schema({
    isSandbox: Boolean,
    connectedUsername: String,
});

const name = 'SalesforceEntity';
const Entity =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Entity };

module.exports = { Entity };
