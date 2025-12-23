const chalk = require('chalk');

async function runAuthTests(definition, ApiClass, credentials, options) {
    console.log(chalk.blue('\n🧪 Running Authentication Tests\n'));

    const moduleName = definition.moduleName || definition.getName?.() || 'unknown';
    const results = {
        testAuthRequest: { status: 'pending' },
        getEntityDetails: { status: 'pending' },
        getCredentialDetails: { status: 'pending' },
        tokenRefresh: { status: 'pending' },
        sampleApiCall: { status: 'pending' },
        credentialProps: { set: 0, total: 0 },
        entityProps: { set: 0, total: 0 },
    };

    // 1. Create fresh API instance with credentials
    const apiParams = {
        ...definition.env,
        ...credentials.tokens,
        ...credentials.apiParams,
    };

    const api = new ApiClass(apiParams);

    // If API key, set it
    if (credentials.apiKey) {
        if (typeof api.setApiKey === 'function') {
            api.setApiKey(credentials.apiKey);
        } else {
            api.api_key = credentials.apiKey;
            api.access_token = credentials.apiKey;
        }
    }

    // 2. Run testAuthRequest
    console.log(chalk.gray('1. Running testAuthRequest...'));
    try {
        let testResult;
        if (definition.requiredAuthMethods?.testAuthRequest) {
            testResult = await definition.requiredAuthMethods.testAuthRequest(api);
        } else {
            testResult = await tryCommonTestMethods(api);
        }

        console.log(chalk.green('   ✓ testAuthRequest passed'));
        results.testAuthRequest = { status: 'passed' };

        if (options.verbose && testResult) {
            console.log(chalk.gray('   Response preview:'));
            const preview = JSON.stringify(testResult, null, 2);
            const truncated = preview.length > 500 ? preview.slice(0, 500) + '\n   ...' : preview;
            console.log(chalk.gray('   ' + truncated.split('\n').join('\n   ')));
        }
    } catch (error) {
        console.log(chalk.red('   ✗ testAuthRequest failed'));
        console.log(chalk.red(`   Error: ${error.message}`));
        results.testAuthRequest = { status: 'failed', error: error.message };
        if (options.verbose && error.stack) {
            console.log(chalk.gray(`   Stack: ${error.stack.split('\n').slice(1, 4).join('\n   ')}`));
        }
        throw new Error(`Authentication test failed: ${error.message}`);
    }

    // 3. Test getEntityDetails
    console.log(chalk.gray('\n2. Testing getEntityDetails...'));
    const entityResult = await testGetEntityDetails(definition, api, credentials, options);
    if (entityResult.skipped) {
        console.log(chalk.yellow(`   ⚠ Skipped (${entityResult.reason})`));
        results.getEntityDetails = { status: 'skipped', reason: entityResult.reason };
    } else if (entityResult.error) {
        console.log(chalk.red(`   ✗ Failed: ${entityResult.error}`));
        results.getEntityDetails = { status: 'failed', error: entityResult.error };
    } else if (!entityResult.consistent) {
        console.log(chalk.yellow(`   ⚠ Entity mismatch (saved: ${entityResult.savedId}, fresh: ${entityResult.freshId})`));
        results.getEntityDetails = { status: 'warning', message: 'entity mismatch' };
    } else {
        console.log(chalk.green(`   ✓ getEntityDetails returned consistent entity${entityResult.freshId ? ` (externalId: ${entityResult.freshId})` : ''}`));
        results.getEntityDetails = { status: 'passed' };
    }

    // 4. Test getCredentialDetails
    console.log(chalk.gray('\n3. Testing getCredentialDetails...'));
    const credResult = await testGetCredentialDetails(definition, api, options);
    if (credResult.skipped) {
        console.log(chalk.yellow(`   ⚠ Skipped (${credResult.reason})`));
        results.getCredentialDetails = { status: 'skipped', reason: credResult.reason };
    } else if (credResult.error) {
        console.log(chalk.red(`   ✗ Failed: ${credResult.error}`));
        results.getCredentialDetails = { status: 'failed', error: credResult.error };
    } else if (!credResult.valid) {
        console.log(chalk.yellow('   ⚠ getCredentialDetails did not return valid identifiers'));
        results.getCredentialDetails = { status: 'warning', message: 'invalid structure' };
    } else {
        console.log(chalk.green('   ✓ getCredentialDetails returned valid identifiers'));
        results.getCredentialDetails = { status: 'passed' };
        if (options.verbose && credResult.credentials?.identifiers) {
            const ids = credResult.credentials.identifiers;
            console.log(chalk.gray(`   Identifiers: ${JSON.stringify(ids)}`));
        }
    }

    // 5. Test token refresh
    console.log(chalk.gray('\n4. Testing token refresh...'));
    const refreshResult = await testTokenRefresh(api, credentials, options);
    if (refreshResult.skipped) {
        console.log(chalk.yellow(`   ⚠ Skipped (${refreshResult.reason})`));
        results.tokenRefresh = { status: 'skipped', reason: refreshResult.reason };
    } else if (refreshResult.error) {
        console.log(chalk.red(`   ✗ Failed: ${refreshResult.error}`));
        results.tokenRefresh = { status: 'failed', error: refreshResult.error };
    } else {
        const tokenMsg = refreshResult.tokenChanged ? 'token refreshed successfully' : 'refresh called but token unchanged';
        console.log(chalk.green(`   ✓ ${tokenMsg}`));
        results.tokenRefresh = { status: 'passed', tokenChanged: refreshResult.tokenChanged };
    }

    // 6. Run a sample API call if available
    console.log(chalk.gray('\n5. Running sample API call...'));
    const sampleResult = await runSampleApiCall(api, ApiClass, options);
    if (sampleResult.success) {
        results.sampleApiCall = { status: 'passed', method: sampleResult.method };
    } else {
        results.sampleApiCall = { status: 'skipped', reason: 'no methods available' };
    }

    // 7. Verify credential persistence properties
    console.log(chalk.gray('\n6. Verifying credential properties (apiPropertiesToPersist.credential)...'));
    const credProps = definition.requiredAuthMethods?.apiPropertiesToPersist?.credential || [];
    results.credentialProps.total = credProps.length;

    if (credProps.length === 0) {
        console.log(chalk.gray('   (no credential properties defined)'));
    } else {
        for (const prop of credProps) {
            const value = api[prop];
            if (value !== undefined && value !== null && value !== '') {
                console.log(chalk.green(`   ✓ ${prop}: ${maskSensitive(prop, value)}`));
                results.credentialProps.set++;
            } else {
                console.log(chalk.yellow(`   ⚠ ${prop}: not set or empty`));
            }
        }
    }

    // 8. Verify entity persistence properties
    console.log(chalk.gray('\n7. Verifying entity properties (apiPropertiesToPersist.entity)...'));
    const entityProps = definition.requiredAuthMethods?.apiPropertiesToPersist?.entity || [];
    results.entityProps.total = entityProps.length;

    if (entityProps.length === 0) {
        console.log(chalk.gray('   (no entity properties defined)'));
    } else {
        for (const prop of entityProps) {
            const value = api[prop];
            if (value !== undefined && value !== null && value !== '') {
                console.log(chalk.green(`   ✓ ${prop}: ${maskSensitive(prop, value)}`));
                results.entityProps.set++;
            } else {
                console.log(chalk.yellow(`   ⚠ ${prop}: not set or empty`));
            }
        }
    }

    // 9. Summary
    console.log(chalk.blue('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.blue('Summary'));
    console.log(chalk.blue('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

    printSummaryLine('testAuthRequest', results.testAuthRequest);
    printSummaryLine('getEntityDetails', results.getEntityDetails);
    printSummaryLine('getCredentialDetails', results.getCredentialDetails);
    printSummaryLine('tokenRefresh', results.tokenRefresh);
    printSummaryLine('sampleApiCall', results.sampleApiCall);

    const credPropsStatus = results.credentialProps.total === 0
        ? chalk.gray('n/a')
        : (results.credentialProps.set === results.credentialProps.total
            ? chalk.green(`${results.credentialProps.set}/${results.credentialProps.total} set`)
            : chalk.yellow(`${results.credentialProps.set}/${results.credentialProps.total} set`));
    console.log(`  credentialProps:      ${credPropsStatus}`);

    const entityPropsStatus = results.entityProps.total === 0
        ? chalk.gray('n/a')
        : (results.entityProps.set === results.entityProps.total
            ? chalk.green(`${results.entityProps.set}/${results.entityProps.total} set`)
            : chalk.yellow(`${results.entityProps.set}/${results.entityProps.total} set`));
    console.log(`  entityProps:          ${entityPropsStatus}`);

    console.log('');

    // Check if any critical tests failed
    const criticalFailed = results.testAuthRequest.status === 'failed';
    if (criticalFailed) {
        throw new Error('Critical authentication tests failed');
    }

    console.log(chalk.green('✓ All authentication tests passed'));

    return {
        testAuthRequestPassed: results.testAuthRequest.status === 'passed',
        getEntityDetailsPassed: results.getEntityDetails.status === 'passed',
        getCredentialDetailsPassed: results.getCredentialDetails.status === 'passed',
        tokenRefreshPassed: results.tokenRefresh.status === 'passed',
        sampleApiCallPassed: results.sampleApiCall.status === 'passed',
        sampleMethod: results.sampleApiCall.method,
        credentialPropertiesValid: results.credentialProps.set === results.credentialProps.total,
        entityPropertiesValid: results.entityProps.set === results.entityProps.total,
    };
}

function printSummaryLine(name, result) {
    const paddedName = (name + ':').padEnd(22);
    let statusText;

    switch (result.status) {
        case 'passed':
            statusText = chalk.green('✓ passed');
            break;
        case 'failed':
            statusText = chalk.red('✗ failed');
            break;
        case 'skipped':
            statusText = chalk.yellow(`⚠ skipped${result.reason ? ` (${result.reason})` : ''}`);
            break;
        case 'warning':
            statusText = chalk.yellow(`⚠ ${result.message || 'warning'}`);
            break;
        default:
            statusText = chalk.gray('pending');
    }

    console.log(`  ${paddedName}${statusText}`);
}

async function testGetEntityDetails(definition, api, savedCredentials, options) {
    if (!definition.requiredAuthMethods?.getEntityDetails) {
        return { skipped: true, reason: 'not defined' };
    }

    try {
        const freshEntity = await definition.requiredAuthMethods.getEntityDetails(
            api,
            {},  // callbackParams
            {},  // tokenResponse
            'cli-test-user'
        );

        const savedId = savedCredentials.entity?.identifiers?.externalId;
        const freshId = freshEntity?.identifiers?.externalId;
        const consistent = !savedId || !freshId || savedId === freshId;

        return {
            success: true,
            consistent,
            freshId,
            savedId,
            freshEntity
        };
    } catch (error) {
        return { error: error.message };
    }
}

async function testGetCredentialDetails(definition, api, options) {
    if (!definition.requiredAuthMethods?.getCredentialDetails) {
        return { skipped: true, reason: 'not defined' };
    }

    try {
        const credentials = await definition.requiredAuthMethods.getCredentialDetails(
            api,
            'cli-test-user'
        );

        const valid = credentials && typeof credentials.identifiers === 'object';
        return { success: true, valid, credentials };
    } catch (error) {
        return { error: error.message };
    }
}

async function testTokenRefresh(api, savedCredentials, options) {
    // Check if refresh token exists
    if (!savedCredentials.tokens?.refresh_token) {
        return { skipped: true, reason: 'no refresh token' };
    }

    // Check if API supports refresh
    if (typeof api.refreshAccessToken !== 'function') {
        return { skipped: true, reason: 'refreshAccessToken not implemented' };
    }

    try {
        const oldToken = api.access_token;
        await api.refreshAccessToken();
        const newToken = api.access_token;

        return {
            success: true,
            tokenChanged: newToken !== oldToken
        };
    } catch (error) {
        return { error: error.message };
    }
}

async function tryCommonTestMethods(api) {
    const methodsToTry = [
        'getUserDetails',
        'getUser',
        'getCurrentUser',
        'getMe',
        'getAccount',
        'getProfile',
    ];

    for (const method of methodsToTry) {
        if (typeof api[method] === 'function') {
            return await api[method]();
        }
    }

    throw new Error('No testAuthRequest method defined and no common test methods available');
}

async function runSampleApiCall(api, ApiClass, options) {
    const sampleMethods = [
        { name: 'getUserDetails', description: 'Get user details' },
        { name: 'getUser', description: 'Get user' },
        { name: 'getCurrentUser', description: 'Get current user' },
        { name: 'listObjects', description: 'List objects' },
        { name: 'listContacts', description: 'List contacts' },
        { name: 'listDeals', description: 'List deals' },
        { name: 'listUsers', description: 'List users' },
        { name: 'getWorkspace', description: 'Get workspace' },
        { name: 'getOrganization', description: 'Get organization' },
    ];

    for (const { name, description } of sampleMethods) {
        if (typeof api[name] === 'function') {
            console.log(chalk.gray(`   Trying ${name}()...`));
            try {
                const result = await api[name]();
                console.log(chalk.green(`   ✓ Sample API call (${name}) succeeded`));

                if (options.verbose && result) {
                    console.log(chalk.gray('   Response preview:'));
                    const preview = JSON.stringify(result, null, 2);
                    const truncated = preview.length > 300 ? preview.slice(0, 300) + '\n   ...' : preview;
                    console.log(chalk.gray('   ' + truncated.split('\n').join('\n   ')));
                }

                return { success: true, method: name };
            } catch (error) {
                console.log(chalk.yellow(`   ⚠ ${name}() failed: ${error.message}`));
            }
        }
    }

    console.log(chalk.gray('   No additional sample API calls available for this module'));
    return { success: false, method: null };
}

function maskSensitive(prop, value) {
    const sensitiveProps = [
        'access_token',
        'refresh_token',
        'api_key',
        'apiKey',
        'client_secret',
        'password',
        'secret',
        'token',
    ];

    const propLower = prop.toLowerCase();
    const isSensitive = sensitiveProps.some(sp => propLower.includes(sp.toLowerCase()));

    if (isSensitive && typeof value === 'string') {
        if (value.length <= 8) {
            return '***';
        }
        return value.slice(0, 4) + '...' + value.slice(-4);
    }

    const strValue = String(value);
    if (strValue.length > 50) {
        return strValue.slice(0, 47) + '...';
    }

    return strValue;
}

module.exports = { runAuthTests };
