const mongoose = require('mongoose');
const { Entity: Parent } = require('@friggframework/module-plugin');

const schema = new mongoose.Schema({
    isSandbox: Boolean,
    connectedUsername: String,
});

const Entity = Parent.discriminator('salesforceEntity', schema);

module.exports = { Entity };
