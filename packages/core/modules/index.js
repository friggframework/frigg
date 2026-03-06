const { ApiKeyRequester } = require('./requester/api-key');
const { BasicAuthRequester } = require('./requester/basic');
const { OAuth2Requester } = require('./requester/oauth-2');
const { Requester } = require('./requester/requester');
const { ModuleConstants } = require('./ModuleConstants');
const { ModuleFactory } = require('./module-factory');

module.exports = {
    // Entity is a Mongoose model — lazy-load to avoid pulling in mongoose
    // for PostgreSQL-only deployments
    get Entity() { return require('./entity').Entity; },
    ApiKeyRequester,
    BasicAuthRequester,
    OAuth2Requester,
    Requester,
    ModuleConstants,
    ModuleFactory,
};
