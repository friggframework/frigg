const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Import doctor command for post-deployment health check
const { doctorCommand } = require('../doctor-command');

// Configuration constants
const PATHS = {
    APP_DEFINITION: 'index.js',
    INFRASTRUCTURE: 'infrastructure.js'
};

const COMMANDS = {
    SERVERLESS: 'osls'  // OSS-Serverless (drop-in replacement for serverless v3)
};

/**
 * Constructs filtered environment variables for serverless deployment
 * @param {string[]} appDefinedVariables - Array of environment variable names from app definition
 * @returns {Object} Filtered environment variables object
 */
function buildFilteredEnvironment(appDefinedVariables) {
    return {
        // Essential system variables needed to run serverless
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USER: process.env.USER,

        // AWS credentials and configuration (all AWS_ prefixed variables)
        ...Object.fromEntries(
            Object.entries(process.env).filter(([key]) =>
                key.startsWith('AWS_')
            )
        ),

        // App-defined environment variables
        ...Object.fromEntries(
            appDefinedVariables
                .map((key) => [key, process.env[key]])
                .filter(([_, value]) => value !== undefined)
        ),
    };
}

/**
 * Loads and parses the app definition from index.js
 * @returns {Object|null} App definition object or null if not found
 */
function loadAppDefinition() {
    const appDefPath = path.join(process.cwd(), PATHS.APP_DEFINITION);

    if (!fs.existsSync(appDefPath)) {
        return null;
    }

    try {
        const { Definition } = require(appDefPath);
        return Definition;
    } catch (error) {
        console.warn('Could not load appDefinition environment config:', error.message);
        return null;
    }
}

/**
 * Extracts environment variable names from app definition
 * @param {Object} appDefinition - App definition object
 * @returns {string[]} Array of environment variable names
 */
function extractEnvironmentVariables(appDefinition) {
    if (!appDefinition?.environment) {
        return [];
    }

    console.log('🔧 Loading environment configuration from appDefinition...');

    const appDefinedVariables = Object.keys(appDefinition.environment).filter(
        (key) => appDefinition.environment[key] === true
    );

    console.log(`   Found ${appDefinedVariables.length} environment variables: ${appDefinedVariables.join(', ')}`);
    return appDefinedVariables;
}

/**
 * Handles environment validation warnings
 * @param {Object} validation - Validation result object
 * @param {Object} options - Deploy command options
 */
function handleValidationWarnings(validation, options) {
    if (validation.missing.length === 0 || options.skipEnvValidation) {
        return;
    }

    console.warn(`⚠️  Warning: Missing ${validation.missing.length} environment variables: ${validation.missing.join(', ')}`);
    console.warn('   These variables are optional and deployment will continue');
    console.warn('   Run with --skip-env-validation to bypass this check');
}

/**
 * Validates environment variables and builds filtered environment
 * @param {Object} appDefinition - App definition object
 * @param {Object} options - Deploy command options
 * @returns {Object} Filtered environment variables
 */
function validateAndBuildEnvironment(appDefinition, options) {
    if (!appDefinition) {
        return buildFilteredEnvironment([]);
    }

    const appDefinedVariables = extractEnvironmentVariables(appDefinition);

    // Try to use the env-validator if available
    try {
        const { validateEnvironmentVariables } = require('@friggframework/devtools/infrastructure/env-validator');
        const validation = validateEnvironmentVariables(appDefinition);

        handleValidationWarnings(validation, options);
        return buildFilteredEnvironment(appDefinedVariables);

    } catch (validatorError) {
        // Validator not available, do basic validation
        const missingVariables = appDefinedVariables.filter((variable) => !process.env[variable]);

        if (missingVariables.length > 0) {
            console.warn(`⚠️  Warning: Missing ${missingVariables.length} environment variables: ${missingVariables.join(', ')}`);
            console.warn('   These variables are optional and deployment will continue');
            console.warn('   Set them in your CI/CD environment or .env file if needed');
        }

        return buildFilteredEnvironment(appDefinedVariables);
    }
}

/**
 * Executes the serverless deployment command
 * @param {Object} environment - Environment variables to pass to serverless
 * @param {Object} options - Deploy command options
 * @returns {Promise<number>} Exit code
 */
function executeServerlessDeployment(environment, options) {
    return new Promise((resolve, reject) => {
        console.log('🚀 Deploying serverless application...');

        const serverlessArgs = [
            'deploy',
            '--config',
            PATHS.INFRASTRUCTURE,
            '--stage',
            options.stage,
        ];

        // Add --force flag if force option is true
        if (options.force === true) {
            serverlessArgs.push('--force');
        }

        const childProcess = spawn(COMMANDS.SERVERLESS, serverlessArgs, {
            cwd: path.resolve(process.cwd()),
            stdio: 'inherit',
            env: {
                ...environment,
                SLS_STAGE: options.stage, // Set stage for resource discovery
            },
        });

        childProcess.on('error', (error) => {
            console.error(`Error executing command: ${error.message}`);
            reject(error);
        });

        childProcess.on('close', (code) => {
            if (code !== 0) {
                console.log(`Child process exited with code ${code}`);
                resolve(code);
            } else {
                resolve(0);
            }
        });
    });
}

/**
 * Get stack name from app definition
 * @param {Object} appDefinition - App definition
 * @param {Object} options - Deploy options
 * @returns {string|null} Stack name
 */
function getStackName(appDefinition, options) {
    // Try to get from app definition
    if (appDefinition?.name) {
        const stage = options.stage || 'dev';
        return `${appDefinition.name}-${stage}`;
    }

    // Try to get from infrastructure.js
    const infraPath = path.join(process.cwd(), PATHS.INFRASTRUCTURE);
    if (fs.existsSync(infraPath)) {
        try {
            const infraModule = require(infraPath);
            if (infraModule.service) {
                const stage = options.stage || 'dev';
                return `${infraModule.service}-${stage}`;
            }
        } catch (error) {
            // Ignore errors reading infrastructure file
        }
    }

    return null;
}

/**
 * Run post-deployment health check
 * @param {string} stackName - CloudFormation stack name
 * @param {Object} options - Deploy options
 */
async function runPostDeploymentHealthCheck(stackName, options) {
    console.log('\n' + '═'.repeat(80));
    console.log('Running post-deployment health check...');
    console.log('═'.repeat(80));

    try {
        // Run doctor command (will exit process on its own)
        // Note: We need to catch the exit to prevent deploy from exiting
        const originalExit = process.exit;
        let doctorExitCode = 0;

        // Temporarily override process.exit to capture exit code
        process.exit = (code) => {
            doctorExitCode = code || 0;
        };

        try {
            await doctorCommand(stackName, {
                region: options.region,
                format: 'console',
                verbose: options.verbose,
            });
        } catch (error) {
            console.log(`\n⚠️  Health check encountered an error: ${error.message}`);
            if (options.verbose) {
                console.error(error.stack);
            }
        } finally {
            // Restore original process.exit
            process.exit = originalExit;
        }

        // Inform user about health check results
        if (doctorExitCode === 0) {
            console.log('\n✓ Post-deployment health check: PASSED');
        } else if (doctorExitCode === 2) {
            console.log('\n⚠️  Post-deployment health check: DEGRADED');
            console.log('   Run "frigg repair" to fix detected issues');
        } else {
            console.log('\n✗ Post-deployment health check: FAILED');
            console.log('   Run "frigg doctor" for detailed report');
            console.log('   Run "frigg repair" to fix detected issues');
        }
    } catch (error) {
        console.log(`\n⚠️  Post-deployment health check failed: ${error.message}`);
        if (options.verbose) {
            console.error(error.stack);
        }
    }
}

async function deployCommand(options) {
    const stage = options.stage || 'dev';
    const region = process.env.AWS_REGION || 'us-east-1';

    if (options.dryRun) {
        console.log('🔍 Running deployment dry-run...\n');

        try {
            const { executeDryRun } = require('./dry-run');
            const appPath = process.cwd();
            const appDefinition = loadAppDefinition();

            if (!appDefinition) {
                console.error('❌ Could not load app definition from index.js');
                process.exit(1);
            }

            const stackName = getStackName(appDefinition, options);
            if (!stackName) {
                console.error('❌ Could not determine stack name from app definition');
                process.exit(1);
            }

            const report = await executeDryRun({
                appPath,
                stackName,
                region,
                stage,
                options,
            });

            process.exit(report.getExitCode());
        } catch (error) {
            console.error(`\n❌ Dry-run failed: ${error.message}`);
            if (options.verbose) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    }

    console.log('Deploying the serverless application...');

    const appDefinition = loadAppDefinition();
    const environment = validateAndBuildEnvironment(appDefinition, options);

    const exitCode = await executeServerlessDeployment(environment, options);

    if (exitCode !== 0) {
        console.error(`\n✗ Deployment failed with exit code ${exitCode}`);
        process.exit(exitCode);
    }

    console.log('\n✓ Deployment completed successfully!');

    if (!options.skipDoctor) {
        const stackName = getStackName(appDefinition, options);

        if (stackName) {
            await runPostDeploymentHealthCheck(stackName, options);
        } else {
            console.log('\n⚠️  Could not determine stack name - skipping health check');
            console.log('   Run "frigg doctor <stack-name>" manually to check stack health');
        }
    } else {
        console.log('\n⏭️  Skipping post-deployment health check (--skip-doctor)');
    }
}

module.exports = { deployCommand };
