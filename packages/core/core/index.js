const { Delegate } = require('../dist/core/Delegate');
const { Worker } = require('../dist/core/Worker');
const { loadInstalledModules } = require('../dist/core/load-installed-modules');
const { createHandler } = require('../dist/core/create-handler');
const { secretsToEnv } = require('../dist/core/secrets-to-env');

module.exports = { Delegate, Worker, loadInstalledModules, createHandler, secretsToEnv };
