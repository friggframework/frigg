const { IntegrationMapping: Parent } = require('@friggframework/core-rollup');
'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema({});

const name = 'SlackMessage';
const IntegrationMapping =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { IntegrationMapping };
