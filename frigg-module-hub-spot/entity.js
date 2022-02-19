'use strict';
const mongoose = require('mongoose');
const { Entity: Parent } = require('@friggframework/module-plugin');

const schema = new mongoose.Schema({});

const Entity = Parent.discriminator('HubSpotEntity', schema);
module.exports = { Entity };
