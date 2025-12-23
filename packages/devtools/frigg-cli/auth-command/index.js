const chalk = require('chalk');
const { loadModule, validateModule, getAuthType } = require('./module-loader');
const { runOAuthFlow } = require('./oauth-flow');
const { runApiKeyFlow } = require('./api-key-flow');
const { CredentialStorage } = require('./credential-storage');
const { runAuthTests } = require('./auth-tester');

async function test(moduleName, options) {
    console.log(chalk.blue.bold(`\n🔐 Frigg Authenticator\n`));
    console.log(chalk.gray(`Testing authentication for: ${moduleName}\n`));

    try {
        // 1. Load and validate module
        const { definition, Api } = await loadModule(moduleName);
        validateModule(definition);

        // 2. Determine auth type
        const authType = getAuthType(Api);
        console.log(chalk.gray(`Auth type detected: ${authType}`));

        let credentials;

        // 3. Run appropriate auth flow
        if (authType === 'apiKey' || authType === 'api_key') {
            // API key flow handles missing --api-key by checking for getAuthorizationRequirements
            // and rendering an interactive form if available
            credentials = await runApiKeyFlow(definition, Api, options.apiKey, options);
        } else {
            // OAuth2 flow
            credentials = await runOAuthFlow(definition, Api, {
                port: parseInt(options.port, 10) || 3333,
                timeout: parseInt(options.timeout, 10) || 300,
                browser: options.browser,
                verbose: options.verbose,
            });
        }

        // 4. Run verification tests
        await runAuthTests(definition, Api, credentials, {
            verbose: options.verbose,
        });

        // 5. Save credentials
        const storage = new CredentialStorage();
        const savedPath = await storage.save(moduleName, credentials, authType);

        console.log(chalk.green(`\n✓ Authentication successful for ${moduleName}!`));
        console.log(chalk.gray(`  Credentials saved to: ${savedPath}`));
        console.log(chalk.gray(`\n  Use 'frigg auth get ${moduleName} --json' to retrieve credentials.\n`));

    } catch (error) {
        console.log(chalk.red(`\n✗ Authentication failed: ${error.message}`));
        if (options.verbose && error.stack) {
            console.log(chalk.gray('\nStack trace:'));
            console.log(chalk.gray(error.stack));
        }
        process.exit(1);
    }
}

async function list(options) {
    const storage = new CredentialStorage();
    const credentials = await storage.list();

    if (options.json) {
        console.log(JSON.stringify(credentials, null, 2));
        return;
    }

    console.log(chalk.blue.bold('\n🔐 Saved Credentials\n'));

    if (credentials.length === 0) {
        console.log(chalk.gray('  No credentials saved.\n'));
        console.log(chalk.gray('  Run `frigg auth test <module>` to authenticate a module.\n'));
        return;
    }

    // Display as table
    const tableData = credentials.map(c => ({
        Module: c.module,
        'Auth Type': c.authType,
        Entity: c.entity,
        'Has Access Token': c.hasAccessToken ? '✓' : '✗',
        'Has Refresh Token': c.hasRefreshToken ? '✓' : '-',
        'Saved At': formatDate(c.savedAt),
    }));

    console.table(tableData);
    console.log('');
}

async function get(moduleName, options) {
    const storage = new CredentialStorage();
    const credentials = await storage.get(moduleName);

    if (!credentials) {
        console.log(chalk.red(`\n✗ No credentials found for: ${moduleName}`));
        console.log(chalk.gray(`\n  Run 'frigg auth test ${moduleName}' to authenticate.\n`));
        process.exit(1);
    }

    if (options.json) {
        console.log(JSON.stringify(credentials, null, 2));
        return;
    }

    if (options.export) {
        outputAsEnvVars(moduleName, credentials);
        return;
    }

    // Display formatted
    console.log(chalk.blue.bold(`\n🔐 Credentials for ${moduleName}\n`));

    console.log(chalk.gray('Auth Type:'), credentials.authType);
    console.log(chalk.gray('Obtained:'), formatDate(credentials.obtainedAt));
    console.log(chalk.gray('Saved:'), formatDate(credentials.savedAt));

    if (credentials.entity?.details?.name) {
        console.log(chalk.gray('Entity:'), credentials.entity.details.name);
    }
    if (credentials.entity?.identifiers?.externalId) {
        console.log(chalk.gray('External ID:'), credentials.entity.identifiers.externalId);
    }

    console.log(chalk.gray('\nTokens:'));
    if (credentials.tokens?.access_token) {
        console.log(chalk.gray('  access_token:'), maskToken(credentials.tokens.access_token));
    }
    if (credentials.tokens?.refresh_token) {
        console.log(chalk.gray('  refresh_token:'), maskToken(credentials.tokens.refresh_token));
    }
    if (credentials.apiKey) {
        console.log(chalk.gray('  api_key:'), maskToken(credentials.apiKey));
    }

    console.log(chalk.gray(`\n  Use --json for full output or --export for environment variables.\n`));
}

async function deleteCredentials(moduleName, options) {
    const storage = new CredentialStorage();

    if (options.all) {
        if (!options.yes) {
            const confirmed = await confirmAction('Delete ALL saved credentials?');
            if (!confirmed) {
                console.log(chalk.gray('Cancelled.'));
                return;
            }
        }
        await storage.deleteAll();
        console.log(chalk.green('✓ All credentials deleted'));
        return;
    }

    if (!moduleName) {
        console.log(chalk.red('✗ Error: Please specify a module name or use --all'));
        console.log(chalk.gray('\nUsage:'));
        console.log(chalk.gray('  frigg auth delete <module>'));
        console.log(chalk.gray('  frigg auth delete --all'));
        process.exit(1);
    }

    const exists = await storage.get(moduleName);
    if (!exists) {
        console.log(chalk.yellow(`No credentials found for: ${moduleName}`));
        return;
    }

    if (!options.yes) {
        const confirmed = await confirmAction(`Delete credentials for ${moduleName}?`);
        if (!confirmed) {
            console.log(chalk.gray('Cancelled.'));
            return;
        }
    }

    const deleted = await storage.delete(moduleName);
    if (deleted) {
        console.log(chalk.green(`✓ Credentials deleted for ${moduleName}`));
    } else {
        console.log(chalk.yellow(`No credentials found for: ${moduleName}`));
    }
}

// Helper functions

function formatDate(dateStr) {
    if (!dateStr) return 'Unknown';
    try {
        const date = new Date(dateStr);
        return date.toLocaleString();
    } catch {
        return dateStr;
    }
}

function maskToken(token) {
    if (!token || token.length <= 8) {
        return '***';
    }
    return token.slice(0, 4) + '...' + token.slice(-4);
}

function outputAsEnvVars(moduleName, credentials) {
    const prefix = moduleName.toUpperCase().replace(/-/g, '_');

    const vars = [];

    if (credentials.tokens?.access_token) {
        vars.push(`export ${prefix}_ACCESS_TOKEN="${credentials.tokens.access_token}"`);
    }
    if (credentials.tokens?.refresh_token) {
        vars.push(`export ${prefix}_REFRESH_TOKEN="${credentials.tokens.refresh_token}"`);
    }
    if (credentials.apiKey) {
        vars.push(`export ${prefix}_API_KEY="${credentials.apiKey}"`);
    }
    if (credentials.entity?.identifiers?.externalId) {
        vars.push(`export ${prefix}_EXTERNAL_ID="${credentials.entity.identifiers.externalId}"`);
    }
    if (credentials.apiParams?.companyDomain) {
        vars.push(`export ${prefix}_COMPANY_DOMAIN="${credentials.apiParams.companyDomain}"`);
    }

    if (vars.length === 0) {
        console.log(chalk.yellow('# No credentials to export'));
    } else {
        console.log(vars.join('\n'));
    }
}

async function confirmAction(message) {
    // Simple confirmation using readline
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(chalk.yellow(`${message} [y/N] `), (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}

module.exports = {
    authCommand: {
        test,
        list,
        get,
        delete: deleteCredentials,
    },
};
