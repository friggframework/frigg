const { spawn } = require('node:child_process');
const path = require('node:path');
const { AppResolver } = require('../utils/app-resolver');

async function startCommand(options) {
    if (options.verbose) {
        console.log('Verbose mode enabled');
        console.log('Options:', options);
    }
    console.log('Starting backend and optional frontend...');
    
    // Suppress AWS SDK warning message about maintenance mode
    process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = 1;
    
    // Resolve app path using AppResolver
    const appResolver = new AppResolver();
    let backendPath;
    
    try {
        backendPath = await appResolver.resolveAppPath(options);
        if (options.verbose) {
            console.log('Resolved app path:', backendPath);
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
    console.log(`Starting backend in ${backendPath}...`);
    const infrastructurePath = 'infrastructure.js';
    const command = 'serverless';
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

module.exports = { startCommand };
