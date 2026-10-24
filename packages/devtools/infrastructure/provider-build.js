/**
 * Build for a non-AWS provider (friggframework/frigg#545, 302ab9ba /
 * c8705715).
 *
 * Instead of the serverless/CloudFormation pipeline, the provider plugin
 * (resolved from appDefinition.provider) does the build. First, core
 * extensions' Prisma models are composed into the backend's Prisma client
 * (compose-extension-prisma.js), since the functions bundle that client:
 *   1. validate(appDefinition)              - errors abort, warnings print
 *   2. generateConfig(appDefinition)        - e.g. netlify.toml
 *   3. getFunctionEntryPoints(appDefinition) - written to <project>/netlify/functions
 *   4. getLibEntryPoints(appDefinition)     - written to <project>/netlify/lib
 *
 * <project> is the directory that holds backend/: the generated entry points
 * require '../../backend/...', so they must sit beside it. #545 had two
 * copies of this, and the CLI one wrote into the backend directory itself,
 * where those relative requires do not resolve.
 *
 * Shared by createFriggInfrastructure() (`node infrastructure.js package`,
 * what a backend's `npm run build` runs) and `frigg build`.
 */
const path = require('path');
const fs = require('fs');
const { composeAppExtensionPrisma } = require('./compose-extension-prisma');

const CONFIG_FILE_NAMES = { netlify: 'netlify.toml' };

/**
 * @param {Object} params
 * @param {Object} params.appDefinition
 * @param {string} params.backendDir - directory containing the backend's index.js
 * @param {Object} [params.provider] - resolved plugin; defaults to resolveProvider(appDefinition)
 * @param {boolean} [params.verbose]
 * @param {Function} [params.exit] - called with 1 on validation errors (default process.exit)
 * @param {Function} [params.composePrisma] - extension Prisma composition (injected in tests)
 * @returns {{ projectDir: string, written: string[] }}
 */
function buildWithProvider({
    appDefinition,
    backendDir,
    provider,
    verbose = false,
    exit = (code) => process.exit(code),
    composePrisma = composeAppExtensionPrisma,
}) {
    const providerName = appDefinition.provider;
    const plugin =
        provider ||
        require('@friggframework/core/providers/resolve-provider').resolveProvider(
            appDefinition
        );
    const projectDir = path.dirname(path.resolve(backendDir));
    const written = [];

    console.log(`Building for ${providerName} provider (skipping AWS infrastructure)...`);

    if (typeof plugin.validate === 'function') {
        const validation = plugin.validate(appDefinition);
        if (validation.errors?.length > 0) {
            console.error(`\nValidation errors for ${providerName}:`);
            for (const error of validation.errors) {
                console.error(`  - ${error}`);
            }
            exit(1);
            return { projectDir, written };
        }
        for (const warning of validation.warnings || []) {
            console.warn(`  Warning: ${warning}`);
        }
    }

    composePrisma({ appDefinition, backendDir });

    const write = (filePath, content) => {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf-8');
        written.push(filePath);
        if (verbose) console.log(`  Written ${path.relative(projectDir, filePath)}`);
    };

    if (typeof plugin.generateConfig === 'function') {
        const fileName = CONFIG_FILE_NAMES[providerName] || `${providerName}.config`;
        write(path.join(projectDir, fileName), plugin.generateConfig(appDefinition));
        console.log(`  Written ${fileName}`);
    }

    if (typeof plugin.getFunctionEntryPoints === 'function') {
        const entryPoints = plugin.getFunctionEntryPoints(appDefinition);
        for (const [fileName, content] of Object.entries(entryPoints)) {
            write(path.join(projectDir, 'netlify', 'functions', fileName), content);
        }
        console.log(`  Generated ${Object.keys(entryPoints).length} function entry points`);
    }

    if (typeof plugin.getLibEntryPoints === 'function') {
        const libEntryPoints = plugin.getLibEntryPoints(appDefinition);
        for (const [fileName, content] of Object.entries(libEntryPoints)) {
            write(path.join(projectDir, 'netlify', 'lib', fileName), content);
        }
        console.log(`  Generated ${Object.keys(libEntryPoints).length} lib entry points`);
    }

    if (typeof plugin.generateEnvTemplate === 'function') {
        const missing = Object.entries(plugin.generateEnvTemplate(appDefinition)).filter(
            ([key]) => !process.env[key]
        );
        if (missing.length > 0) {
            console.log('\n  Environment variables not set locally (configure them on the platform):');
            for (const [key] of missing) console.log(`    - ${key}`);
        }
    }

    console.log(`\nBuild complete for ${providerName}.`);
    return { projectDir, written };
}

/**
 * True when the app definition names a provider other than AWS.
 * @param {Object} [appDefinition]
 */
function isNonAwsProvider(appDefinition) {
    const name = appDefinition?.provider;
    return Boolean(name) && name !== 'aws';
}

module.exports = { buildWithProvider, isNonAwsProvider };
