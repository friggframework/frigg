const eslintConfig = require('../../../utils/eslint-config')
const prettierConfig = require('../../../utils/prettier-config')
const testEnvironment = require('./test-environment/index');

module.exports = {
    eslintConfig,
    prettierConfig,
    ...testEnvironment
}