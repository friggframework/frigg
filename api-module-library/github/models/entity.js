const mongoose = require('mongoose');
const { Entity: Parent } = require('@friggframework/module-plugin');

const schema = new mongoose.Schema({});
const name = 'GithubEntity';
const Entity =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Entity };
