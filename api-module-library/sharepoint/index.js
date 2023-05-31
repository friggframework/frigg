const { Api } = require('./api');
const { Credential } = require('./models/credential');
const { Entity } = require('./models/entity');
const ModuleManager = require('./manager');
const config = require('config');

module.exports = {
    Api,
    Credential,
    Entity,
    ModuleManager,
    Config: config.get('meta'),
};
