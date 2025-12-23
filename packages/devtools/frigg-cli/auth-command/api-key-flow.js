const chalk = require('chalk');

async function runApiKeyFlow(definition, ApiClass, apiKey, options) {
    const moduleName = definition.moduleName || definition.getName?.() || 'unknown';

    console.log(chalk.blue('\n🔑 API-Key Authentication Flow\n'));
    console.log(chalk.gray(`Module: ${moduleName}`));

    // 1. Create API instance with environment params
    const apiParams = {
        ...definition.env,
    };
    const api = new ApiClass(apiParams);

    // 2. Set API key using available methods
    let apiKeySet = false;

    // Try different methods to set the API key
    if (definition.requiredAuthMethods?.setAuthParams) {
        // Some modules have setAuthParams in definition
        await definition.requiredAuthMethods.setAuthParams(api, {
            apiKey,
            data: { apiKey, api_key: apiKey, access_token: apiKey }
        });
        apiKeySet = true;
    } else if (typeof api.setApiKey === 'function') {
        // Standard ApiKeyRequester method
        api.setApiKey(apiKey);
        apiKeySet = true;
    } else if (typeof api.setAuthParams === 'function') {
        // Alternative method name
        await api.setAuthParams({ apiKey, api_key: apiKey, access_token: apiKey });
        apiKeySet = true;
    } else {
        // Direct property assignment as fallback
        api.api_key = apiKey;
        api.access_token = apiKey;
        apiKeySet = true;
    }

    if (!apiKeySet) {
        throw new Error(
            `Could not set API key for module ${moduleName}.\n` +
            `Module does not have setApiKey(), setAuthParams(), or setAuthParams in requiredAuthMethods.`
        );
    }

    console.log(chalk.green('✓ API key configured'));

    // 3. Get entity details
    console.log(chalk.gray('Fetching entity details...'));

    let entityDetails;
    if (definition.requiredAuthMethods?.getEntityDetails) {
        try {
            entityDetails = await definition.requiredAuthMethods.getEntityDetails(
                api,
                {},
                { api_key: apiKey },
                'cli-test-user'
            );
        } catch (err) {
            console.log(chalk.yellow(`  Warning: getEntityDetails failed: ${err.message}`));
            entityDetails = {
                identifiers: { externalId: 'unknown', user: 'cli-test-user' },
                details: { name: 'API Key Authentication' }
            };
        }
    } else {
        entityDetails = {
            identifiers: { externalId: 'unknown', user: 'cli-test-user' },
            details: { name: 'API Key Authentication' }
        };
    }

    console.log(chalk.green('✓ Entity details retrieved'));

    if (entityDetails?.details?.name) {
        console.log(chalk.gray(`  Entity: ${entityDetails.details.name}`));
    }

    // 4. Get credential details
    let credentialDetails = {};
    if (definition.requiredAuthMethods?.getCredentialDetails) {
        try {
            credentialDetails = await definition.requiredAuthMethods.getCredentialDetails(
                api,
                'cli-test-user'
            );
        } catch (err) {
            console.log(chalk.yellow(`  Warning: Could not get credential details: ${err.message}`));
        }
    }

    // 5. Return credentials object
    return {
        apiKey,
        entity: entityDetails,
        credential: credentialDetails,
        apiParams: sanitizeApiParams(apiParams),
        obtainedAt: new Date().toISOString(),
    };
}

function sanitizeApiParams(params) {
    // Remove sensitive data that shouldn't be stored in readable form
    const sanitized = { ...params };
    delete sanitized.client_secret;
    return sanitized;
}

module.exports = { runApiKeyFlow };
