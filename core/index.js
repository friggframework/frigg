const testEnvironment = require('./test-environment/index');
const core = require('./core/index');
const database = require('./database/index');
const assertions = require('./assertions/index');
const integrations = require('./integrations/index');
const errors =  require('./errors/index');
const encrypt = require('./encrypt/encrypt');
const lambda = require('./lambda/index');
const logs = require('./logs/index');
const modulePlugin = require('./module-plugin/index');

const eslintConfig = require('./eslint-config')
const prettierConfig = require('./prettier-config')

// const {Sync } = require('./syncs/model');

module.exports = {
    ...testEnvironment,
    ...core,
    ...database,
    ...assertions,
    ...integrations,
    ...errors,
    ...encrypt,
    ...lambda,
    ...logs,
    ...modulePlugin,
    eslintConfig,
    prettierConfig
}