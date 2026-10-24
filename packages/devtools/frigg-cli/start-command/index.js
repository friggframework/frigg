const { spawn } = require('node:child_process');
const path = require('node:path');
const dotenv = require('dotenv');
const chalk = require('chalk');
const {
    validateDatabaseUrl,
    getDatabaseType,
    checkPrismaClientGenerated
} = require('../utils/database-validator');
const {
    getDatabaseUrlMissingError,
    getDatabaseTypeNotConfiguredError,
    getPrismaClientNotGeneratedError
} = require('../utils/error-messages');

async function startCommand(options) {
    if (options.verbose) {
        console.log('Verbose mode enabled');
        console.log('Options:', options);
    }

    console.log(chalk.blue('🚀 Starting Frigg application...\n'));

    // Load environment variables from .env file
    const envPath = path.join(process.cwd(), '.env');
    dotenv.config({ path: envPath });

    // Pre-flight database checks
    try {
        await performDatabaseChecks(options.verbose);
    } catch (error) {
        console.error(chalk.red('\n❌ Pre-flight checks failed'));
        console.error(chalk.gray('Fix the issues above before starting the application.\n'));
        process.exit(1);
    }

    console.log(chalk.green('✓ Database checks passed\n'));
    console.log('Starting backend and optional frontend...');

    // A non-AWS provider runs its own local dev server (friggframework/frigg#545).
    const providerResult = loadNonAwsProvider();
    if (providerResult) {
        return startWithProvider(providerResult, options);
    }

    // Suppress AWS SDK warning message about maintenance mode
    process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = '1';
    // Skip AWS discovery for local development
    process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';
    const backendPath = path.resolve(process.cwd());
    console.log(`Starting backend in ${backendPath}...`);
    const infrastructurePath = 'infrastructure.js';
    const command = 'osls';  // OSS-Serverless (drop-in replacement for serverless v3)
    const args = [
        'offline',
        '--config',
        infrastructurePath,
        '--stage',
        options.stage
    ];

    // Add verbose flag to serverless if verbose option is enabled
    if (options.verbose) {
        args.push('--verbose');
    }

    if (options.verbose) {
        console.log(`Executing command: ${command} ${args.join(' ')}`);
        console.log(`Working directory: ${backendPath}`);
    }

    const childProcess = spawn(command, args, {
        cwd: backendPath,
        stdio: 'inherit',
        env: {
            ...process.env,
            FRIGG_SKIP_AWS_DISCOVERY: 'true',
        },
    });

    childProcess.on('error', (error) => {
        console.error(`Error executing command: ${error.message}`);
    });

    childProcess.on('close', (code) => {
        if (code !== 0) {
            console.log(`Child process exited with code ${code}`);
        }
    });
}

/**
 * Performs pre-flight database validation checks
 * @param {boolean} verbose - Enable verbose output
 * @throws {Error} If any validation check fails
 */
async function performDatabaseChecks(verbose) {
    // Check 1: Validate DATABASE_URL exists
    if (verbose) {
        console.log(chalk.gray('Checking DATABASE_URL...'));
    }

    const urlValidation = validateDatabaseUrl();
    if (!urlValidation.valid) {
        console.error(getDatabaseUrlMissingError());
        throw new Error('DATABASE_URL validation failed');
    }

    if (verbose) {
        console.log(chalk.green('✓ DATABASE_URL found'));
    }

    // Check 2: Determine database type
    if (verbose) {
        console.log(chalk.gray('Determining database type...'));
    }

    const dbTypeResult = getDatabaseType();
    if (dbTypeResult.error) {
        console.error(chalk.red('❌ ' + dbTypeResult.error));
        console.error(getDatabaseTypeNotConfiguredError());
        throw new Error('Database type determination failed');
    }

    const dbType = dbTypeResult.dbType;

    if (verbose) {
        console.log(chalk.green(`✓ Database type: ${dbType}`));
    }

    // Check 3: Verify Prisma client is generated (BEFORE connection test to prevent auto-generation)
    if (verbose) {
        console.log(chalk.gray('Checking Prisma client...'));
    }

    const clientCheck = checkPrismaClientGenerated(dbType);

    if (!clientCheck.generated) {
        console.error(getPrismaClientNotGeneratedError(dbType));
        console.error(chalk.yellow('\nRun this command to generate the Prisma client:'));
        console.error(chalk.cyan('  frigg db:setup\n'));
        throw new Error('Prisma client not generated');
    }

    if (verbose) {
        console.log(chalk.green('✓ Prisma client generated'));
    }

    // Note: We skip connection testing in the start command because when using frigg:local,
    // the CLI code runs from tmp/frigg but the client is in backend/node_modules,
    // causing module resolution mismatches. The backend will test its own database
    // connection when it starts.
}

function loadNonAwsProvider() {
    try {
        const { loadProviderForCli } = require('../utils/provider-helper');
        const result = loadProviderForCli();
        return result && result.provider ? result : null;
    } catch {
        return null;
    }
}

/**
 * Local dev server per provider: Netlify -> `netlify dev` (reads netlify.toml
 * and serves the generated functions), run from the project root that holds
 * backend/ and netlify.toml.
 */
function startWithProvider({ providerName, backendDir }, options = {}) {
    const DEV_COMMANDS = {
        netlify: { command: 'netlify', args: ['dev'] },
    };
    const devCmd = DEV_COMMANDS[providerName];
    if (!devCmd) {
        console.error(chalk.red(
            `Provider '${providerName}' does not have a local dev server configured.\n` +
            `  Supported providers for local dev: ${Object.keys(DEV_COMMANDS).join(', ')}, aws`
        ));
        process.exit(1);
    }

    const cwd = require('node:path').dirname(backendDir);
    console.log(chalk.blue(`Starting local dev server (${providerName})...`));
    if (options.verbose) {
        console.log(`Executing command: ${devCmd.command} ${devCmd.args.join(' ')}`);
        console.log(`Working directory: ${cwd}`);
    }

    const childProcess = spawn(devCmd.command, devCmd.args, {
        cwd,
        stdio: 'inherit',
        env: { ...process.env },
    });
    childProcess.on('error', (error) => {
        if (error.code === 'ENOENT') {
            console.error(chalk.red(`'${devCmd.command}' not found. Install it with: npm install -g ${devCmd.command}-cli`));
        } else {
            console.error(`Error executing command: ${error.message}`);
        }
    });
    childProcess.on('close', (code) => {
        if (code !== 0) console.log(`Child process exited with code ${code}`);
    });
}

module.exports = { startCommand };
