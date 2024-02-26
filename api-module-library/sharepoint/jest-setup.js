const { globalSetup } = require('@friggframework/core-rollup');
const dotenv= require('dotenv');

const parsed = {
    SHAREPOINT_SCOPE: 'sharepoint_scope_test',
    SHAREPOINT_CLIENT_ID: 'sharepoint_client_id_test',
    SHAREPOINT_CLIENT_SECRET: 'sharepoint_client_secret_test',
    REDIRECT_URI: 'http://redirect_uri_test'
};

dotenv.populate(process.env, parsed);

module.exports = globalSetup;
