const { withSSMParameters, ssmParameterStore } = require('../handlers/ssm-handler-wrapper');

/**
 * Example Lambda handler that uses SSM Parameter Store
 * 
 * This example shows how to:
 * 1. Automatically load all parameters as environment variables
 * 2. Access specific parameters programmatically
 * 3. Use secrets from Secrets Manager
 */

// Option 1: Wrap your handler to auto-load parameters
const mainHandler = async (event, context) => {
    console.log('Handler executing with SSM parameters loaded');
    
    // All parameters are now available as environment variables
    // e.g., parameter /my-app/prod/database/url becomes DATABASE_URL
    const databaseUrl = process.env.DATABASE_URL;
    
    // You can also access parameters programmatically
    const apiKey = await ssmParameterStore.getParameter('api-keys/salesforce');
    
    // Your business logic here
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Success',
            hasDatabase: !!databaseUrl,
            hasApiKey: !!apiKey
        })
    };
};

// Export the wrapped handler
exports.handler = withSSMParameters(mainHandler, {
    parameterPath: '',  // Load all parameters under the prefix
    loadSecrets: true,  // Also load secrets from Secrets Manager
    failOnError: true   // Fail if parameters can't be loaded
});

// Option 2: Manual parameter loading in handler
exports.manualHandler = async (event, context) => {
    try {
        // Load specific parameters
        const dbConfig = await ssmParameterStore.getParametersByPath('database', {
            recursive: true,
            withDecryption: true
        });
        
        // Load a single parameter
        const featureFlag = await ssmParameterStore.getParameter('features/enable-webhooks');
        
        // Load a secret
        const apiSecrets = await ssmParameterStore.getSecret(process.env.SECRET_ARN);
        
        // Use the loaded values
        console.log('Database config:', dbConfig);
        console.log('Feature flag:', featureFlag);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Parameters loaded successfully'
            })
        };
    } catch (error) {
        console.error('Failed to load parameters:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Failed to load configuration'
            })
        };
    }
};

// Option 3: Use with existing Frigg integration handlers
const { createHandler } = require('@friggframework/core');

exports.friggHandler = createHandler({
    eventName: 'Frigg SSM Example',
    method: withSSMParameters(async (event, context) => {
        // Your Frigg integration logic here
        // All SSM parameters are already loaded as environment variables
        
        return {
            message: 'Frigg handler with SSM parameters',
            environment: process.env.NODE_ENV,
            hasSSMPrefix: !!process.env.SSM_PARAMETER_PREFIX
        };
    }, {
        parameterPath: 'integrations',  // Load only integration-specific parameters
        loadSecrets: true
    })
});