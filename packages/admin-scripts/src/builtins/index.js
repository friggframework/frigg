const { OAuthTokenRefreshScript } = require('./oauth-token-refresh');
const { IntegrationHealthCheckScript } = require('./integration-health-check');

/**
 * Built-in Admin Scripts
 *
 * These scripts ship with @friggframework/admin-scripts and provide
 * common maintenance and monitoring functionality.
 */
const builtinScripts = [OAuthTokenRefreshScript, IntegrationHealthCheckScript];

/**
 * Register all built-in scripts with a factory
 * @param {ScriptFactory} factory - Script factory to register with
 */
function registerBuiltinScripts(factory) {
    factory.registerAll(builtinScripts);
}

module.exports = {
    OAuthTokenRefreshScript,
    IntegrationHealthCheckScript,
    builtinScripts,
    registerBuiltinScripts,
};
