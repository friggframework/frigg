const { createFriggBackend } = require('@friggframework/core');
const appDefinition = require('./app-definition');

const backend = createFriggBackend(appDefinition);
module.exports = {...backend}
