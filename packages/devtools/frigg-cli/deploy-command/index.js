const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration constants
const PATHS = {
    APP_DEFINITION: 'index.js',
    INFRASTRUCTURE: 'infrastructure.js'
};

const COMMANDS = {
    SERVERLESS: 'serverless'
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
 */
function executeServerlessDeployment(environment, options) {
    console.log('🚀 Deploying serverless application...');
    
    const serverlessArgs = [
        'deploy',
        '--config',
        PATHS.INFRASTRUCTURE,
        '--stage',
        options.stage,
    ];

    const childProcess = spawn(COMMANDS.SERVERLESS, serverlessArgs, {
        cwd: path.resolve(process.cwd()),
        stdio: 'inherit',
        env: environment,
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

async function deployCommand(options) {
    console.log('Deploying the serverless application...');

    const appDefinition = loadAppDefinition();
    const environment = validateAndBuildEnvironment(appDefinition, options);
    
    executeServerlessDeployment(environment, options);
}

module.exports = { deployCommand };
