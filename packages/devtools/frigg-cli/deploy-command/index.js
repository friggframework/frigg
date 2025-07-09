const { spawn, spawnSync } = require('child_process');
const path = require('path');
const { AppResolver } = require('../utils/app-resolver');

async function deployCommand(options) {
    console.log('Deploying the serverless application...');

    // AWS discovery is now handled directly in serverless-template.js
    console.log('🚀 Deploying serverless application...');

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
    const infrastructurePath = 'infrastructure.js';
    const command = 'serverless';
    const serverlessArgs = [
        'deploy',
        '--config',
        infrastructurePath,
        '--stage',
        options.stage
    ];

    const childProcess = spawn(command, serverlessArgs, {
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

module.exports = { deployCommand };
