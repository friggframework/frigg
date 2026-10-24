const { spawnSync } = require('child_process');
const path = require('path');

async function buildCommand(options = {}) {
    // A non-AWS provider (appDefinition.provider) builds through its plugin:
    // platform config + function entry points, no serverless package
    // (friggframework/frigg#545).
    const providerResult = loadProviderIfConfigured();
    if (providerResult) {
        const { buildWithProvider } = require('../../infrastructure/provider-build');
        buildWithProvider({
            appDefinition: providerResult.appDefinition,
            backendDir: providerResult.backendDir,
            provider: providerResult.provider,
            verbose: options.verbose,
        });
        return;
    }

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

/**
 * The resolved non-AWS provider, or null for AWS / no app definition found.
 */
function loadProviderIfConfigured() {
    const { loadProviderForCli } = require('../utils/provider-helper');
    let result;
    try {
        result = loadProviderForCli();
    } catch (error) {
        // A non-AWS provider whose package is missing: say so, don't build for AWS.
        console.error(error.message);
        process.exit(1);
    }
    return result && result.provider ? result : null;
}

module.exports = { buildCommand };
