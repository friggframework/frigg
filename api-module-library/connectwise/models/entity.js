const { Entity: Parent } = require('@friggframework/core');
const mongoose = require('mongoose');

const schema = new mongoose.Schema({});

const name = 'ConnectWiseEntity';
const Entity =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Entity };
