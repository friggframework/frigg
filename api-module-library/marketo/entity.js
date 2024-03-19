const { Entity: Parent } = require('@friggframework/core');
'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    munchkin_id: { type: String, trim: true },
});
const name = 'MarketoEntity';
const Entity =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Entity };
