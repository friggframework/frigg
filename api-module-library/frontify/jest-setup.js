const dotenv= require('dotenv');
const { globalSetup } = require('@friggframework/test-environment');

const parsed = {
    FRONTIFY_SCOPE: 'frontify_scope_test',
    FRONTIFY_CLIENT_ID: 'frontify_client_id_test',
    FRONTIFY_CLIENT_SECRET: 'frontify_client_secret_test',
    REDIRECT_URI: 'http://redirect_uri_test'
};

dotenv.populate(process.env, parsed);

module.exports = globalSetup;
