const mongoose = require('mongoose');
const { Entity: Parent } = require('@friggframework/module-plugin');

const schema = new mongoose.Schema({});

const Entity = Parent.discriminator('FastSpringIQEntity', schema);
module.exports = { Entity };
