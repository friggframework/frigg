const {
    resolveProvider,
    determineProviderName,
    providerPackageName,
    KNOWN_PROVIDERS,
} = require('./resolve-provider');
const {
    isDeployedRuntime,
    isAwsLambdaRuntime,
    isLocalRun,
    resolveActiveProvider,
} = require('./runtime-detection');

module.exports = {
    resolveProvider,
    determineProviderName,
    providerPackageName,
    KNOWN_PROVIDERS,
    isDeployedRuntime,
    isAwsLambdaRuntime,
    isLocalRun,
    resolveActiveProvider,
};
