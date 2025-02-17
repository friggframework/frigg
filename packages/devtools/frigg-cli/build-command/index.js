const { spawn } = require('child_process');
const path = require('path');

function buildCommand(options) {
    console.log('Building the serverless application...');
    const backendPath = path.resolve(process.cwd());
    const infrastructurePath = 'infrastructure.js';
    const command = 'serverless';
    const serverlessArgs = [
        'package',
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

module.exports = { buildCommand };
