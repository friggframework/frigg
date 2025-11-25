#!/usr/bin/env node

// Version Detection Wrapper
// This code runs when frigg-cli is installed globally
// It checks for a local installation and prefers it if newer
(function versionDetection() {
    // Skip version detection if explicitly disabled (prevents recursion)
    if (process.env.FRIGG_CLI_SKIP_VERSION_CHECK === 'true') {
        return;
    }

    const path = require('path');
    const fs = require('fs');
    const semver = require('semver');
    const { spawn } = require('child_process');

    // Get the directory from which the command was invoked
    const cwd = process.cwd();

    // Try to find local frigg-cli installation
    const localCliPath = path.join(cwd, 'node_modules', '@friggframework', 'frigg-cli');
    const localCliPackageJson = path.join(localCliPath, 'package.json');
    const localCliIndex = path.join(localCliPath, 'index.js');

    // Get global version (this package)
    const globalVersion = require('./package.json').version;

    // Check if local installation exists
    if (fs.existsSync(localCliPackageJson) && fs.existsSync(localCliIndex)) {
        try {
            const localPackage = JSON.parse(fs.readFileSync(localCliPackageJson, 'utf8'));
            const localVersion = localPackage.version;

            // Compare versions
            const comparison = semver.compare(localVersion, globalVersion);

            if (comparison >= 0) {
                // Local version is newer or equal - use it
                console.log(`Using local frigg-cli@${localVersion} (global: ${globalVersion})`);

                // Execute local CLI as subprocess to avoid module resolution issues
                const args = process.argv.slice(2); // Remove 'node' and script path
                const child = spawn(process.execPath, [localCliIndex, ...args], {
                    stdio: 'inherit',
                    env: {
                        ...process.env,
                        FRIGG_CLI_SKIP_VERSION_CHECK: 'true', // Prevent recursion
                    },
                });

                child.on('exit', (code) => {
                    process.exit(code || 0);
                });

                // Signal that we've delegated to local CLI
                process.on('SIGINT', () => {
                    child.kill('SIGINT');
                });

                // Prevent further execution
                return true; // Indicates we've delegated
            } else {
                // Global version is newer - warn user
                console.warn(`⚠️  Version mismatch: global frigg-cli@${globalVersion} is newer than local frigg-cli@${localVersion}`);
                console.warn(`   Consider updating local version: npm install @friggframework/frigg-cli@latest`);
            }
        } catch (error) {
            // Failed to read local package.json or compare versions
            // Continue with global version silently
        }
    }

    // Return false to indicate we should continue with global version
    return false;
})();

const { Command } = require('commander');
const { initCommand } = require('./init-command');
const { installCommand } = require('./install-command');
const { startCommand } = require('./start-command'); // Assuming you have a startCommand module
const { buildCommand } = require('./build-command');
const { deployCommand } = require('./deploy-command');
const { generateIamCommand } = require('./generate-iam-command');
const { uiCommand } = require('./ui-command');
const { dbSetupCommand } = require('./db-setup-command');
const { doctorCommand } = require('./doctor-command');
const { repairCommand } = require('./repair-command');

const program = new Command();

program
    .command('init [templateName]')
    .description('Initialize a new Frigg application')
    .option('-t, --template <template>', 'template to use', 'backend-only')
    .option('-n, --name <name>', 'project name')
    .option('-d, --directory <directory>', 'target directory')
    .action(initCommand);

program
    .command('install [apiModuleName]')
    .description('Install an API module')
    .action(installCommand);

program
    .command('start')
    .description('Run the backend and optional frontend')
    .option('-s, --stage <stage>', 'deployment stage', 'dev')
    .option('-v, --verbose', 'enable verbose output')
    .action(startCommand);

program
    .command('build')
    .description('Build the serverless application')
    .option('-s, --stage <stage>', 'deployment stage', 'dev')
    .option('-v, --verbose', 'enable verbose output')
    .option('-p, --production', 'build for production (enables AWS discovery)')
    .action(buildCommand);

program
    .command('deploy')
    .description('Deploy the serverless application')
    .option('-s, --stage <stage>', 'deployment stage', 'dev')
    .option('-v, --verbose', 'enable verbose output')
    .option('-f, --force', 'force deployment (bypasses caching for layers and functions)')
    .option('--skip-doctor', 'skip post-deployment health check')
    .option('--skip-env-validation', 'skip environment variable validation')
    .option('--dry-run', 'preview deployment changes without executing')
    .option('--output <format>', 'output format for dry-run (console or json)', 'console')
    .action(deployCommand);

program
    .command('generate-iam')
    .description('Generate IAM CloudFormation template based on app definition')
    .option('-o, --output <path>', 'output directory', 'backend/infrastructure')
    .option('-u, --user <name>', 'deployment user name', 'frigg-deployment-user')
    .option('-s, --stack-name <name>', 'CloudFormation stack name', 'frigg-deployment-iam')
    .option('-v, --verbose', 'enable verbose output')
    .action(generateIamCommand);

program
    .command('ui')
    .description('Launch the Frigg Management UI')
    .option('-p, --port <port>', 'port to run the UI on', '3210')
    .option('--no-open', 'do not open browser automatically')
    .action(uiCommand);

program
    .command('db:setup')
    .description('Set up database schema and generate Prisma client')
    .option('-s, --stage <stage>', 'deployment stage', 'development')
    .option('-v, --verbose', 'enable verbose output')
    .action(dbSetupCommand);

program
    .command('doctor [stackName]')
    .description('Run health check on deployed CloudFormation stack')
    .option('-r, --region <region>', 'AWS region (defaults to AWS_REGION env var or us-east-1)')
    .option('-f, --format <format>', 'output format (console or json)', 'console')
    .option('-o, --output <path>', 'save report to file')
    .option('-v, --verbose', 'enable verbose output')
    .action(doctorCommand);

program
    .command('repair <stackName>')
    .description('Repair infrastructure issues (import orphaned resources, reconcile property drift)')
    .option('-r, --region <region>', 'AWS region (defaults to AWS_REGION env var or us-east-1)')
    .option('--import', 'import orphaned resources into stack')
    .option('--reconcile', 'reconcile property drift')
    .option('--mode <mode>', 'reconciliation mode (template or resource)', 'template')
    .option('-y, --yes', 'skip confirmation prompts')
    .option('-v, --verbose', 'enable verbose output')
    .action(repairCommand);

program.parse(process.argv);

module.exports = { initCommand, installCommand, startCommand, buildCommand, deployCommand, generateIamCommand, uiCommand, dbSetupCommand, doctorCommand, repairCommand };
