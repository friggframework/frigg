const { OAuthCallbackServer } = require('./oauth-callback-server');
const { openBrowser } = require('./utils/browser');
const chalk = require('chalk');
const crypto = require('crypto');

async function runOAuthFlow(definition, ApiClass, options) {
    const port = options.port || 3333;
    const redirectUri = process.env.REDIRECT_URI || `http://localhost:${port}`;
    const moduleName =
        definition.moduleName || definition.getName?.() || 'unknown';

    // 1. Generate state for CSRF protection
    const state = crypto.randomBytes(16).toString('hex');

    // 2. Create API instance with auth params
    const apiParams = {
        ...definition.env,
        redirect_uri: redirectUri,
        state,
    };
    const api = new ApiClass(apiParams);

    // 3. Get authorization URL
    let authUrl;
    if (typeof api.getAuthorizationUri === 'function') {
        authUrl = api.getAuthorizationUri();
    } else if (api.authorizationUri) {
        authUrl = api.authorizationUri;
    }

    if (!authUrl) {
        throw new Error(
            `Module ${moduleName} did not provide an authorization URL.\n` +
                `Expected api.getAuthorizationUri() or api.authorizationUri property.`
        );
    }

    // Add state to URL if not already present
    if (!authUrl.includes('state=')) {
        const separator = authUrl.includes('?') ? '&' : '?';
        authUrl = `${authUrl}${separator}state=${state}`;
    }

    console.log(chalk.blue('\n📝 OAuth2 Authorization Flow\n'));
    console.log(chalk.gray(`Module: ${moduleName}`));
    console.log(chalk.gray(`Redirect URI: ${redirectUri}`));

    // 4. Start callback server
    const server = new OAuthCallbackServer({ port, timeout: options.timeout });
    await server.start();

    try {
        // 5. Open browser for authorization
        console.log(chalk.gray('\nOpening browser for authorization...'));
        try {
            await openBrowser(authUrl);
        } catch (err) {
            console.log(
                chalk.yellow(
                    `Could not open browser automatically: ${err.message}`
                )
            );
            console.log(chalk.yellow('Please open the URL manually:'));
            console.log(chalk.cyan(`\n  ${authUrl}\n`));
        }

        console.log(chalk.gray('Waiting for OAuth callback...'));
        console.log(
            chalk.gray(`(Timeout: ${options.timeout || 300} seconds)\n`)
        );

        // 6. Wait for callback
        const { code, state: returnedState } = await server.waitForCode();

        // 7. Verify state (CSRF protection)
        if (returnedState && returnedState !== state) {
            throw new Error(
                'OAuth state mismatch - possible CSRF attack.\n' +
                    `Expected: ${state}\n` +
                    `Received: ${returnedState}`
            );
        }

        console.log(chalk.green('✓ Authorization code received'));

        // 8. Exchange code for tokens
        console.log(chalk.gray('Exchanging code for tokens...'));

        let tokenResponse;
        if (definition.requiredAuthMethods?.getToken) {
            tokenResponse = await definition.requiredAuthMethods.getToken(api, {
                code,
            });
        } else {
            // Fallback to direct API call
            tokenResponse = await api.getTokenFromCode(code);
        }

        console.log(chalk.green('✓ Tokens received'));

        // 9. Get entity details
        console.log(chalk.gray('Fetching entity details...'));

        let entityDetails;
        if (definition.requiredAuthMethods?.getEntityDetails) {
            entityDetails =
                await definition.requiredAuthMethods.getEntityDetails(
                    api,
                    { code, state: returnedState },
                    tokenResponse,
                    'cli-test-user'
                );
        } else {
            // Minimal entity details if method not provided
            entityDetails = {
                identifiers: { externalId: 'unknown', user: 'cli-test-user' },
                details: { name: 'Unknown' },
            };
        }

        console.log(chalk.green('✓ Entity details retrieved'));

        if (entityDetails?.details?.name) {
            console.log(chalk.gray(`  Entity: ${entityDetails.details.name}`));
        }
        if (entityDetails?.identifiers?.externalId) {
            console.log(
                chalk.gray(
                    `  External ID: ${entityDetails.identifiers.externalId}`
                )
            );
        }

        // 10. Collect credential details
        let credentialDetails = {};
        if (definition.requiredAuthMethods?.getCredentialDetails) {
            try {
                credentialDetails =
                    await definition.requiredAuthMethods.getCredentialDetails(
                        api,
                        'cli-test-user'
                    );
            } catch (err) {
                console.log(
                    chalk.yellow(
                        `  Warning: Could not get credential details: ${err.message}`
                    )
                );
            }
        }

        // 11. Return credentials object
        return {
            tokens: {
                access_token: api.access_token,
                refresh_token: api.refresh_token,
                accessTokenExpire: api.accessTokenExpire,
                refreshTokenExpire: api.refreshTokenExpire,
            },
            entity: entityDetails,
            credential: credentialDetails,
            apiParams: sanitizeApiParams(apiParams),
            tokenResponse: sanitizeTokenResponse(tokenResponse),
            obtainedAt: new Date().toISOString(),
        };
    } finally {
        await server.stop();
    }
}

function sanitizeApiParams(params) {
    // Remove sensitive data that shouldn't be stored
    const sanitized = { ...params };
    delete sanitized.client_secret;
    return sanitized;
}

function sanitizeTokenResponse(response) {
    if (!response) return null;
    // Keep only metadata, not the actual tokens
    return {
        token_type: response.token_type,
        expires_in: response.expires_in,
        scope: response.scope,
        // Include any service-specific metadata (like api_domain for Pipedrive)
        api_domain: response.api_domain,
    };
}

module.exports = { runOAuthFlow };
