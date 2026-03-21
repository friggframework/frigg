const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function buildCommand(options) {
    // Check if the app uses a non-AWS provider
    const providerResult = loadProviderIfConfigured();
    if (providerResult) {
        return buildWithProvider(providerResult, options);
    }

    // Default: AWS build via serverless framework
    console.log('Building the serverless application...');

    // Suppress AWS SDK warning message about maintenance mode
    process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = '1';

    // Skip AWS discovery for local builds (unless --production flag is set)
    if (!options.production) {
        process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';
        console.log('Building in local mode (use --production flag for production builds with AWS discovery)');
    } else {
        console.log('Building in production mode with AWS discovery enabled');
    }

    // AWS discovery is now handled directly in serverless-template.js
    console.log('Packaging serverless application...');
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
}

/**
 * Check if the appDefinition specifies a non-AWS provider and resolve it.
 */
function loadProviderIfConfigured() {
    try {
        const { loadProviderForCli } = require('../utils/provider-helper');
        const result = loadProviderForCli();
        if (result && result.provider) {
            return result;
        }
    } catch {
        // Provider helper not available or appDefinition not found — fall through
    }
    return null;
}

/**
 * Build using a provider plugin.
 * Provider build steps:
 *   1. generateConfig() — generate platform-specific config (netlify.toml, etc.)
 *   2. getFunctionEntryPoints() — copy function files to the project
 */
async function buildWithProvider({ provider, appDefinition, providerName }, options) {
    console.log(`Building for ${providerName} provider...`);
    const projectDir = path.resolve(process.cwd());

    // 1. Validate
    if (typeof provider.validate === 'function') {
        const validation = provider.validate(appDefinition);
        if (validation.errors?.length > 0) {
            console.error(`\nValidation errors for ${providerName}:`);
            for (const error of validation.errors) {
                console.error(`  - ${error}`);
            }
            process.exit(1);
        }
        if (validation.warnings?.length > 0) {
            for (const warning of validation.warnings) {
                console.warn(`  Warning: ${warning}`);
            }
        }
    }

    // 2. Generate platform config (e.g., netlify.toml)
    if (typeof provider.generateConfig === 'function') {
        console.log(`Generating ${providerName} configuration...`);
        const config = provider.generateConfig(appDefinition);

        const configFileNames = {
            netlify: 'netlify.toml',
        };
        const configFileName = configFileNames[providerName] || `${providerName}.config`;
        const configPath = path.join(projectDir, configFileName);

        fs.writeFileSync(configPath, config, 'utf-8');
        console.log(`  Written ${configFileName}`);
    }

    // 3. Copy function entry points
    if (typeof provider.getFunctionEntryPoints === 'function') {
        console.log('Generating function entry points...');
        const entryPoints = provider.getFunctionEntryPoints(appDefinition);
        const functionsDir = path.join(projectDir, 'netlify', 'functions');

        fs.mkdirSync(functionsDir, { recursive: true });

        for (const [filename, content] of Object.entries(entryPoints)) {
            const filePath = path.join(functionsDir, filename);
            fs.writeFileSync(filePath, content, 'utf-8');
            if (options.verbose) {
                console.log(`  Written ${path.relative(projectDir, filePath)}`);
            }
        }

        console.log(`  Generated ${Object.keys(entryPoints).length} function entry points`);
    }

    // 4. Copy lib entry points (re-export shims for runtime dependencies)
    if (typeof provider.getLibEntryPoints === 'function') {
        const libEntryPoints = provider.getLibEntryPoints(appDefinition);
        const libDir = path.join(projectDir, 'netlify', 'lib');

        fs.mkdirSync(libDir, { recursive: true });

        for (const [filename, content] of Object.entries(libEntryPoints)) {
            const filePath = path.join(libDir, filename);
            fs.writeFileSync(filePath, content, 'utf-8');
            if (options.verbose) {
                console.log(`  Written ${path.relative(projectDir, filePath)}`);
            }
        }

        console.log(`  Generated ${Object.keys(libEntryPoints).length} lib entry points`);
    }

    // 5. Generate env template (informational)
    if (typeof provider.generateEnvTemplate === 'function') {
        const envTemplate = provider.generateEnvTemplate(appDefinition);
        const missingEnvVars = Object.entries(envTemplate)
            .filter(([key]) => !process.env[key])
            .map(([key, desc]) => `${key}: ${desc}`);

        if (missingEnvVars.length > 0) {
            console.log(`\n  Required environment variables not set locally:`);
            for (const entry of missingEnvVars) {
                console.log(`    - ${entry}`);
            }
            console.log(`  Configure these in your ${providerName} dashboard.`);
        }
    }

    console.log(`\nBuild complete for ${providerName}.`);
}

module.exports = { buildCommand };
