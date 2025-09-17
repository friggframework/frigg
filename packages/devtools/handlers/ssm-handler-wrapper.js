const ssmParameterStore = require('../utils/ssm-parameter-store');

/**
 * Wrapper for Lambda handlers to automatically load SSM parameters
 * as environment variables before handler execution
 * 
 * @param {Function} handler - The original Lambda handler function
 * @param {Object} options - Configuration options
 * @param {string} options.parameterPath - SSM parameter path to load (optional)
 * @param {boolean} options.loadSecrets - Whether to load secrets from Secrets Manager
 * @param {string} options.secretArn - Secret ARN to load (optional)
 * @returns {Function} Wrapped handler function
 */
function withSSMParameters(handler, options = {}) {
    return async (event, context) => {
        try {
            // Load SSM parameters if enabled
            if (process.env.SSM_PARAMETER_PREFIX) {
                console.log('Loading SSM parameters...');
                
                // Load parameters from the specified path or default to root
                const parameterPath = options.parameterPath || '';
                await ssmParameterStore.loadAsEnvironmentVariables(parameterPath, {
                    recursive: true,
                    withDecryption: true
                });
                
                console.log('SSM parameters loaded successfully');
            }
            
            // Load secrets if enabled and SECRET_ARN is provided
            if (options.loadSecrets && process.env.SECRET_ARN) {
                console.log('Loading secrets from Secrets Manager...');
                
                const secretArn = options.secretArn || process.env.SECRET_ARN;
                const secrets = await ssmParameterStore.getSecret(secretArn);
                
                // Load secrets as environment variables
                if (typeof secrets === 'object') {
                    Object.entries(secrets).forEach(([key, value]) => {
                        process.env[key] = value;
                    });
                    console.log(`Loaded ${Object.keys(secrets).length} secrets as environment variables`);
                } else {
                    console.log('Secret value is not an object, skipping environment variable loading');
                }
            }
            
            // Call the original handler
            return await handler(event, context);
            
        } catch (error) {
            console.error('Error loading parameters/secrets:', error);
            
            // Decide whether to continue or fail based on configuration
            if (options.failOnError !== false) {
                throw error;
            }
            
            // Continue with handler execution even if parameter loading fails
            console.warn('Continuing with handler execution despite parameter loading error');
            return await handler(event, context);
        }
    };
}

/**
 * Middleware to load specific parameters before handler execution
 * 
 * @param {Array<string>} parameterNames - List of parameter names to load
 * @returns {Function} Middleware function
 */
function loadParameters(parameterNames = []) {
    return async (event, context, next) => {
        try {
            const parameters = {};
            
            for (const name of parameterNames) {
                parameters[name] = await ssmParameterStore.getParameter(name);
            }
            
            // Add parameters to the context
            context.ssmParameters = parameters;
            
            // Also optionally add to environment variables
            Object.entries(parameters).forEach(([key, value]) => {
                const envKey = key.toUpperCase().replace(/[/-]/g, '_');
                process.env[envKey] = value;
            });
            
            return next();
        } catch (error) {
            console.error('Error loading parameters:', error);
            throw error;
        }
    };
}

module.exports = {
    withSSMParameters,
    loadParameters,
    ssmParameterStore
};