const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function deployCommand(options) {
    console.log('Deploying the serverless application...');

    // Collect validated environment variables
    let integrationEnvironmentVariables = { ...process.env }; // Start with all, then filter

    // Try to load and validate environment from appDefinition
    const appDefPath = path.join(process.cwd(), 'index.js');
    if (fs.existsSync(appDefPath)) {
        try {
            const { Definition } = require(appDefPath);

            if (Definition.environment) {
                console.log(
                    '🔧 Loading environment configuration from appDefinition...'
                );
                const envVars = Object.keys(Definition.environment).filter(
                    (key) => Definition.environment[key] === true
                );
                console.log(
                    `   Found ${
                        envVars.length
                    } environment variables: ${envVars.join(', ')}`
                );

                // Try to use the env-validator if available
                try {
                    const {
                        validateEnvironmentVariables,
                    } = require('@friggframework/devtools/infrastructure/env-validator');
                    const validation = validateEnvironmentVariables(Definition);

                    if (
                        validation.missing.length > 0 &&
                        !options.skipEnvValidation
                    ) {
                        console.warn(
                            `⚠️  Warning: Missing ${validation.missing.length} environment variables: ${validation.missing.join(', ')}`
                        );
                        console.warn(
                            '   These variables are optional and deployment will continue'
                        );
                        console.warn(
                            '   Run with --skip-env-validation to bypass this check'
                        );
                    }

                    // Pass essential system variables + AWS credentials + app-defined environment variables
                    integrationEnvironmentVariables = {
                        // Essential system variables needed to run serverless
                        PATH: process.env.PATH,
                        HOME: process.env.HOME,
                        USER: process.env.USER,
                        
                        // AWS credentials and configuration (all AWS_ prefixed variables)
                        ...Object.fromEntries(
                            Object.entries(process.env)
                                .filter(([key]) => key.startsWith('AWS_'))
                        ),
                        
                        // App-defined environment variables
                        ...Object.fromEntries(
                            envVars
                                .map((key) => [key, process.env[key]])
                                .filter(([_, value]) => value !== undefined)
                        )
                    };
                } catch (validatorError) {
                    // Validator not available in current version, just warn
                    const missing = envVars.filter((v) => !process.env[v]);
                    if (missing.length > 0) {
                        console.warn(
                            `⚠️  Warning: Missing ${missing.length} environment variables: ${missing.join(
                                ', '
                            )}`
                        );
                        console.warn(
                            '   These variables are optional and deployment will continue'
                        );
                        console.warn(
                            '   Set them in your CI/CD environment or .env file if needed'
                        );
                    }

                    // Pass essential system variables + AWS credentials + app-defined environment variables
                    integrationEnvironmentVariables = {
                        // Essential system variables needed to run serverless
                        PATH: process.env.PATH,
                        HOME: process.env.HOME,
                        USER: process.env.USER,
                        
                        // AWS credentials and configuration (all AWS_ prefixed variables)
                        ...Object.fromEntries(
                            Object.entries(process.env)
                                .filter(([key]) => key.startsWith('AWS_'))
                        ),
                        
                        // App-defined environment variables
                        ...Object.fromEntries(
                            envVars
                                .map((key) => [key, process.env[key]])
                                .filter(([_, value]) => value !== undefined)
                        )
                    };
                }
            }
        } catch (error) {
            console.warn(
                'Could not load appDefinition environment config:',
                error.message
            );
            // Keep all env vars if we can't validate
        }
    }

    // AWS discovery is now handled directly in serverless-template.js
    console.log('🚀 Deploying serverless application...');
    console.log('📋 Final environment variables being passed to serverless:');
    console.log('   ', Object.keys(integrationEnvironmentVariables).sort().join(', '));
    const backendPath = path.resolve(process.cwd());
    const infrastructurePath = 'infrastructure.js';
    const command = 'serverless';
    const serverlessArgs = [
        'deploy',
        '--config',
        infrastructurePath,
        '--stage',
        options.stage,
    ];

    const childProcess = spawn(command, serverlessArgs, {
        cwd: backendPath,
        stdio: 'inherit',
        env: integrationEnvironmentVariables, // Only pass validated environment variables
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

module.exports = { deployCommand };
