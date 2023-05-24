require('dotenv').config({ path: './jest-env' });
const { globalSetup } = require('@friggframework/test-environment');
module.exports = globalSetup;
