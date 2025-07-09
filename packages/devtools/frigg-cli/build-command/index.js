const { spawnSync } = require('child_process');
const path = require('path');
const { AppResolver } = require('../utils/app-resolver');

async function buildCommand(options) {
    console.log('Building the serverless application...');

    // AWS discovery is now handled directly in serverless-template.js
    console.log('📦 Packaging serverless application...');

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
        'package',
        '--config',
        infrastructurePath,
        '--stage',
        options.stage
    ];

    // Add support for --verbose option
    if (options.verbose) {
        serverlessArgs.push('--verbose');
    }

    console.log('Running command from ', backendPath);
    console.log('Serverless Command:', command, serverlessArgs.join(' '));

    const result = spawnSync(command, serverlessArgs, {
        cwd: backendPath,
        stdio: 'inherit',
        shell: true,
        env: {
            ...process.env,
            NODE_PATH: path.resolve(backendPath, 'node_modules'),
        }
    });

    if (result.status !== 0) {
        console.error(`Serverless build failed with code ${result.status}`);
        process.exit(1);
    }

    // childProcess.on('error', (error) => {
    //     console.error(`Error executing command: ${error.message}`);
    // });

    // childProcess.on('close', (code) => {
    //     if (code !== 0) {
    //         console.log(`Child process exited with code ${code}`);
    //     }
    // });
}

module.exports = { buildCommand };
