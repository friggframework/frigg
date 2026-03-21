const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
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

// Import new pre-flight infrastructure
const { DockerAdapter } = require('./infrastructure/DockerAdapter');
const { DatabaseAdapter } = require('./infrastructure/DatabaseAdapter');
const { RunPreflightChecksUseCase } = require('./application/RunPreflightChecksUseCase');
const { InteractivePromptAdapter } = require('./presentation/InteractivePromptAdapter');

async function startCommand(options) {
    if (options.verbose) {
        console.log('Verbose mode enabled');
        console.log('Options:', options);
    }

    console.log(chalk.blue('🚀 Starting Frigg application...\n'));

    // Load environment variables from .env file
    const envPath = path.join(process.cwd(), '.env');
    dotenv.config({ path: envPath });

    const projectPath = process.cwd();

    // Run interactive pre-flight checks if enabled (default: true)
    if (options.interactive !== false) {
        try {
            const preflightPassed = await runInteractivePreflightChecks(projectPath, options);
            if (!preflightPassed) {
                console.error(chalk.red('\n❌ Pre-flight checks failed'));
                console.error(chalk.gray('Fix the issues above before starting the application.\n'));
                process.exit(1);
            }
        } catch (error) {
            if (options.verbose) {
                console.error(chalk.yellow(`Pre-flight check error: ${error.message}`));
            }
            // Fall back to legacy checks if new system fails
        }
    }

    // Legacy pre-flight database checks (still run for Prisma validation)
    try {
        await performDatabaseChecks(options.verbose);
    } catch (error) {
        console.error(chalk.red('\n❌ Pre-flight checks failed'));
        console.error(chalk.gray('Fix the issues above before starting the application.\n'));
        process.exit(1);
    }

    console.log(chalk.green('✓ Pre-flight checks passed\n'));
    console.log('Starting backend and optional frontend...');

    // Check if the app uses a non-AWS provider
    const providerResult = loadProviderIfConfigured();
    if (providerResult) {
        return startWithProvider(providerResult, options);
    }

    // Default: AWS local development via serverless-offline
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
 * Check if the appDefinition specifies a non-AWS provider and resolve it.
 * Returns null for AWS (default) so the caller falls through to existing behavior.
 */
function loadProviderIfConfigured() {
    try {
        const { loadProviderForCli } = require('../utils/provider-helper');
        const result = loadProviderForCli();
        if (result && result.provider) {
            return result;
        }
    } catch {
        // Provider helper not available or appDefinition not found — fall through
    }
    return null;
}

/**
 * Start local dev server using the provider's recommended approach.
 * Each provider has a different local dev story:
 *   - Netlify: `netlify dev` (reads netlify.toml, serves functions locally)
 *   - AWS: `osls offline` (serverless-offline, handled by default path above)
 */
function startWithProvider({ provider, providerName }, options) {
    const backendPath = path.resolve(process.cwd());

    // Provider-specific dev server commands
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

    console.log(chalk.blue(`Starting local dev server (${providerName})...`));

    const args = [...devCmd.args];
    if (options.verbose) {
        console.log(`Executing command: ${devCmd.command} ${args.join(' ')}`);
        console.log(`Working directory: ${backendPath}`);
    }

    const childProcess = spawn(devCmd.command, args, {
        cwd: backendPath,
        stdio: 'inherit',
        env: { ...process.env },
    });

    childProcess.on('error', (error) => {
        if (error.code === 'ENOENT') {
            console.error(chalk.red(
                `'${devCmd.command}' not found. Install it with: npm install -g ${devCmd.command}-cli`
            ));
        } else {
            console.error(`Error executing command: ${error.message}`);
        }
    });

    childProcess.on('close', (code) => {
        if (code !== 0) {
            console.log(`Child process exited with code ${code}`);
        }
    });
}

/**
 * Run interactive pre-flight checks with resolution prompts
 * @param {string} projectPath - Path to the Frigg project
 * @param {object} options - Command options
 * @returns {Promise<boolean>} True if all checks pass or were resolved
 */
async function runInteractivePreflightChecks(projectPath, options) {
    // Create adapters and use case
    const dockerAdapter = new DockerAdapter();
    const databaseAdapter = new DatabaseAdapter();
    const preflightUseCase = new RunPreflightChecksUseCase({
        dockerAdapter,
        databaseAdapter
    });

    // Create prompt adapter based on mode (terminal or IPC)
    const promptMode = options.ipc ? 'ipc' : 'terminal';
    const promptAdapter = InteractivePromptAdapter.create({ mode: promptMode });

    if (options.verbose) {
        console.log(chalk.gray('Running pre-flight checks...'));
    }

    // Track which checks we've already processed to avoid infinite loops
    const processedChecks = new Set();

    // Keep running checks and resolving issues until all pass or no more can be resolved
    let maxIterations = 10; // Safety limit to prevent infinite loops
    while (maxIterations > 0) {
        maxIterations--;

        // Run checks
        const result = await preflightUseCase.execute({ projectPath });

        // If all passed, we're done
        if (result.allPassed) {
            return true;
        }

        // Get resolvable checks that we haven't already processed
        const resolvableChecks = preflightUseCase.getResolvableChecks(result)
            .filter(check => !processedChecks.has(check.name));

        // If no new resolvable checks, show failures and exit
        if (resolvableChecks.length === 0) {
            const failedChecks = result.checks.filter(c => c.status === 'failed');
            for (const check of failedChecks) {
                console.log(chalk.red(`   ✗ ${check.name}: ${check.message}`));
                if (check.resolution?.instructions) {
                    console.log(chalk.gray(`      ${check.resolution.instructions}`));
                }
            }
            return false;
        }

        // Process the first resolvable check
        const check = resolvableChecks[0];
        processedChecks.add(check.name);

        // Display the failure
        console.log(chalk.yellow(`\n⚠️  ${check.message}`));

        // Only prompt if check is resolvable
        if (!check.canResolve) {
            if (check.resolution?.instructions) {
                console.log(chalk.gray(`   ${check.resolution.instructions}`));
            }
            continue;
        }

        // Ask user if they want to resolve
        const response = await promptAdapter.promptForResolution(check);

        if (!response.shouldResolve) {
            console.log(chalk.gray('   Skipping resolution'));
            // User declined, show remaining failures and exit
            const failedChecks = result.checks.filter(c => c.status === 'failed');
            for (const failedCheck of failedChecks) {
                if (failedCheck.name !== check.name) {
                    console.log(chalk.red(`   ✗ ${failedCheck.name}: ${failedCheck.message}`));
                }
            }
            return false;
        }

        // Execute the resolution
        const resolved = await executeResolution(check, dockerAdapter, options);

        if (!resolved) {
            return false;
        }

        // Loop will continue and re-run checks
    }

    // If we exhausted iterations, something went wrong
    console.log(chalk.yellow('   ⚠️  Pre-flight check loop limit reached'));
    return false;
}

/**
 * Execute a resolution action
 * @param {object} check - The check that failed
 * @param {DockerAdapter} dockerAdapter - Docker adapter
 * @param {object} options - Command options
 * @returns {Promise<boolean>} True if resolution succeeded
 */
async function executeResolution(check, dockerAdapter, options) {
    const { resolution } = check;

    switch (resolution.type) {
        case 'start_docker':
            console.log(chalk.blue('   Starting Docker Desktop...'));
            const dockerResult = await dockerAdapter.startDockerDesktop();
            if (!dockerResult.success) {
                console.error(chalk.red(`   Failed to start Docker: ${dockerResult.error}`));
                return false;
            }
            // Wait for Docker to be ready
            console.log(chalk.gray('   Waiting for Docker to start...'));
            const isReady = await dockerAdapter.waitForDockerReady({
                maxAttempts: 60,
                intervalMs: 1000
            });
            if (!isReady) {
                console.error(chalk.red('   Docker did not start in time'));
                return false;
            }
            console.log(chalk.green('   ✓ Docker is now running'));
            return true;

        case 'start_docker_compose':
            console.log(chalk.blue('   Starting Docker Compose services...'));
            const composeResult = await dockerAdapter.startDockerCompose(resolution.composePath);
            if (!composeResult.success) {
                console.error(chalk.red(`   Failed to start services: ${composeResult.error}`));
                return false;
            }
            console.log(chalk.green('   ✓ Docker Compose services started'));
            // Poll LocalStack health endpoint until services are ready
            console.log(chalk.gray('   Waiting for LocalStack to initialize...'));
            const localstackResult = await dockerAdapter.waitForLocalStack({
                maxAttempts: 30,
                intervalMs: 2000
            });
            if (localstackResult.ready) {
                console.log(chalk.green('   ✓ LocalStack services ready'));
                if (options.verbose && localstackResult.services) {
                    console.log(chalk.gray(`     Services: ${Object.keys(localstackResult.services).join(', ')}`));
                }
            } else {
                console.log(chalk.yellow('   ⚠️  LocalStack may not be fully ready'));
                if (localstackResult.error) {
                    console.log(chalk.gray(`     ${localstackResult.error}`));
                }
                // Continue anyway - the service might still work
            }
            return true;

        case 'create_env':
            // Try to copy .env.example to .env
            const projectPath = process.cwd();
            const envExamplePath = path.join(projectPath, '.env.example');
            const envPath = path.join(projectPath, '.env');

            if (fs.existsSync(envExamplePath)) {
                try {
                    fs.copyFileSync(envExamplePath, envPath);
                    console.log(chalk.green('   ✓ Created .env file from .env.example'));
                    console.log(chalk.yellow('   ⚠️  Please edit .env to set your DATABASE_URL'));

                    // Reload environment variables from the new .env file
                    dotenv.config({ path: envPath, override: true });

                    // Check if DATABASE_URL is now set
                    if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '') {
                        console.log(chalk.green('   ✓ DATABASE_URL is now configured'));
                        return true;
                    } else {
                        console.log(chalk.yellow('   ⚠️  DATABASE_URL is still not set in .env'));
                        console.log(chalk.gray('   Please edit .env and set DATABASE_URL, then try again'));
                        return false;
                    }
                } catch (err) {
                    console.error(chalk.red(`   Failed to create .env: ${err.message}`));
                    return false;
                }
            } else {
                console.log(chalk.yellow('   No .env.example file found'));
                console.log(chalk.gray('   Please create a .env file manually with DATABASE_URL'));
                return false;
            }

        case 'run_migrations':
            console.log(chalk.blue('   Running PostgreSQL migrations...'));
            const databaseAdapter = new DatabaseAdapter();
            const migrationProjectPath = process.cwd();

            // Use deploy mode (default) - non-interactive, applies existing migrations
            const migrateResult = await databaseAdapter.runMigrations(migrationProjectPath);

            if (!migrateResult.success) {
                console.error(chalk.red(`   Failed to run migrations: ${migrateResult.error}`));
                console.log(chalk.gray('   Try running "frigg db:setup" manually'));
                return false;
            }

            console.log(chalk.green('   ✓ Database migrations applied successfully'));
            return true;

        default:
            if (options.verbose) {
                console.log(chalk.gray(`   Unknown resolution type: ${resolution.type}`));
            }
            return false;
    }
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

module.exports = { startCommand };
