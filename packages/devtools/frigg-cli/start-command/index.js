const { spawn } = require('child_process');
const path = require('path');

function startCommand(options) {
    console.log('Starting backend and optional frontend...');
    // Suppress AWS SDK warning message about maintenance mode
    process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = 1;
    const backendPath = path.resolve(process.cwd());
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
