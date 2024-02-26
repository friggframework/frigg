const { Entity: Parent } = require('@friggframework/core-rollup');
'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema({});
const name = 'MondayEntity';
const Entity =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Entity };
