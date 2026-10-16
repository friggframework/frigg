/**
 * Provider Resolver
 *
 * Resolves a provider name from the appDefinition into the corresponding
 * @friggframework/provider-{name} package. This is the bridge between
 * `appDefinition.provider` and the provider plugin interface.
 *
 * Resolution order:
 *   1. Explicit `providerName` argument
 *   2. `appDefinition.provider`
 *   3. `FRIGG_PROVIDER` environment variable
 *   4. Default: 'aws'
 *
 * Package naming convention:
 *   provider: 'netlify'  →  require('@friggframework/provider-netlify')
 *   provider: 'aws'      →  require('@friggframework/provider-aws')
 *
 * @example
 *   const provider = resolveProvider({ provider: 'netlify' });
 *   // provider.name === 'netlify'
 *   // provider.deploy(appDefinition, options)
 *   // provider.createHandler(options)
 *   // provider.QueueProvider  (class)
 *   // etc.
 */

const KNOWN_PROVIDERS = ['aws', 'netlify'];

/**
 * Determine the provider name from available sources.
 *
 * @param {Object} [appDefinition] - Frigg app definition
 * @param {string} [providerName] - Explicit override
 * @returns {string} Provider name (e.g. 'netlify', 'aws')
 */
function determineProviderName(appDefinition, providerName) {
    if (providerName) {
        return providerName;
    }
    if (appDefinition?.provider) {
        return appDefinition.provider;
    }
    if (process.env.FRIGG_PROVIDER) {
        return process.env.FRIGG_PROVIDER;
    }
    return 'aws';
}

/**
 * Resolve a provider name to a package name.
 *
 * @param {string} name - Provider name (e.g. 'netlify')
 * @returns {string} npm package name (e.g. '@friggframework/provider-netlify')
 */
function providerPackageName(name) {
    return `@friggframework/provider-${name}`;
}

/**
 * Resolve and load the provider plugin for the given app definition.
 *
 * @param {Object} [appDefinition] - Frigg app definition (reads .provider)
 * @param {Object} [options]
 * @param {string} [options.provider] - Explicit provider name override
 * @returns {Object} Provider plugin (conforms to the provider plugin interface)
 * @throws {Error} If the provider package is not installed
 */
function resolveProvider(appDefinition, options = {}) {
    const name = determineProviderName(appDefinition, options.provider);
    const packageName = providerPackageName(name);

    try {
        return require(packageName);
    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND') {
            const hint = KNOWN_PROVIDERS.includes(name)
                ? `Install it with: npm install ${packageName}`
                : `Is '${name}' a valid Frigg provider? Known providers: ${KNOWN_PROVIDERS.join(', ')}`;

            throw new Error(
                `Provider '${name}' specified in appDefinition but package '${packageName}' is not installed.\n  ${hint}`
            );
        }
        throw error;
    }
}

module.exports = {
    resolveProvider,
    determineProviderName,
    providerPackageName,
    KNOWN_PROVIDERS,
};
