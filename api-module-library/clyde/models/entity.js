const mongoose = require('mongoose');
const { Entity: Parent } = require('@friggframework/module-plugin');

const schema = new mongoose.Schema({});

const Entity = Parent.discriminator('ClydeEntity', schema);
module.exports = { Entity };
