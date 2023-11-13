const { mongoose } = require('@friggframework/database/mongoose');
const { Entity: Parent } = require('@friggframework/module-plugin');

const schema = new mongoose.Schema({});

const name = 'HubSpotEntity';
const Entity =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Entity };
