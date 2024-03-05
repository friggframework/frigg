const eslintConfig = require('./eslint-config')
const prettierConfig = require('./prettier-config')
const testEnvironment = require('./test-environment/index');

module.exports = {
    eslintConfig,
    prettierConfig,
    ...testEnvironment
}