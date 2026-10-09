const { spawnSync } = require('child_process');
const path = require('path');

async function buildCommand(options) {
    console.log('Building the serverless application...');

    // Suppress AWS SDK warning message about maintenance mode
    process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = '1';

    // Skip AWS discovery for local builds (unless --production flag is set)
    if (!options.production) {
        process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';
        console.log('🏠 Building in local mode (use --production flag for production builds with AWS discovery)');
    } else {
        console.log('🚀 Building in production mode with AWS discovery enabled');
    }

    // AWS discovery is now handled directly in serverless-template.js
    console.log('📦 Packaging serverless application...');
    const backendPath = path.resolve(process.cwd());
    const infrastructurePath = 'infrastructure.js';
    const command = 'osls';  // OSS-Serverless (drop-in replacement for serverless v3)
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
            SLS_STAGE: options.stage, // Set stage for resource discovery
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
