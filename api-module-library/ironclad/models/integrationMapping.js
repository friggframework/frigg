'use strict';
const mongoose = require('mongoose');
const { IntegrationMapping: Parent } = require('@friggframework/integrations');

const schema = new mongoose.Schema({});

const name = 'IroncladWorkflow';
const IntegrationMapping =
    Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { IntegrationMapping };
