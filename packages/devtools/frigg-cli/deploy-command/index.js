const { spawn, spawnSync } = require('child_process');
const path = require('path');

async function deployCommand(options) {
    console.log('Deploying the serverless application...');

    // AWS discovery is now handled directly in serverless-template.js
    console.log('🚀 Deploying serverless application...');
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

    console.log('>>> Env vars: ', JSON.stringify(process.env));

    const childProcess = spawn(command, serverlessArgs, {
        cwd: backendPath,
        stdio: 'inherit',
        env: { ...process.env },
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
