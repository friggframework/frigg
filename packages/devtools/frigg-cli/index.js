#!/usr/bin/env node

// Check if we're running the generate command without all options
// If so, we need to restart with proper NODE_OPTIONS to suppress warnings
const args = process.argv.slice(2);
if (args[0] === 'generate' && (!args.includes('--provider') || !args.includes('--format'))) {
    // If NODE_OPTIONS isn't set, restart the process with it
    if (!process.env.NODE_OPTIONS || !process.env.NODE_OPTIONS.includes('--no-warnings')) {
        const { spawn } = require('child_process');
        const nodeOptions = process.env.NODE_OPTIONS ?
            `${process.env.NODE_OPTIONS} --no-deprecation --no-warnings` :
            '--no-deprecation --no-warnings';

        const child = spawn(process.execPath, process.argv.slice(1), {
            stdio: 'inherit',
            env: { ...process.env, NODE_OPTIONS: nodeOptions }
        });

        child.on('exit', (code) => {
            process.exit(code || 0);
        });

        return;
    }
}

const { Command } = require('commander');
const { installCommand } = require('./install-command');
const { startCommand } = require('./start-command'); // Assuming you have a startCommand module
const { buildCommand } = require('./build-command');
const { deployCommand } = require('./deploy-command');
const generateCommand = require('./generate-command');
const { uiCommand } = require('./ui-command');

const program = new Command();
program
    .command('install [apiModuleName]')
    .description('Install an API module')
    .option('--app-path <path>', 'path to Frigg application directory')
    .option('--config <path>', 'path to Frigg configuration file')
    .option('--app <path>', 'alias for --app-path')
    .action(installCommand);

program
    .command('start')
    .description('Run the backend and optional frontend')
    .option('-s, --stage <stage>', 'deployment stage', 'dev')
    .option('-v, --verbose', 'enable verbose output')
    .option('--app-path <path>', 'path to Frigg application directory')
    .option('--config <path>', 'path to Frigg configuration file')
    .option('--app <path>', 'alias for --app-path')
    .action(startCommand);

program
    .command('build')
    .description('Build the serverless application')
    .option('-s, --stage <stage>', 'deployment stage', 'dev')
    .option('-v, --verbose', 'enable verbose output')
    .option('--app-path <path>', 'path to Frigg application directory')
    .option('--config <path>', 'path to Frigg configuration file')
    .option('--app <path>', 'alias for --app-path')
    .action(buildCommand);

program
    .command('deploy')
    .description('Deploy the serverless application')
    .option('-s, --stage <stage>', 'deployment stage', 'dev')
    .option('-v, --verbose', 'enable verbose output')
    .option('--app-path <path>', 'path to Frigg application directory')
    .option('--config <path>', 'path to Frigg configuration file')
    .option('--app <path>', 'alias for --app-path')
    .action(deployCommand);

program
    .command('generate')
    .description('Generate deployment credentials for cloud providers')
    .option('-p, --provider <provider>', 'cloud provider (aws, azure, gcp)')
    .option('-f, --format <format>', 'output format (cloudformation, terraform, pulumi, arm, deployment-manager)')
    .option('-o, --output <path>', 'output directory', 'backend/infrastructure')
    .option('-u, --user <name>', 'deployment user name', 'frigg-deployment-user')
    .option('-s, --stack-name <name>', 'stack name (for CloudFormation)', 'frigg-deployment-iam')
    .option('-v, --verbose', 'enable verbose output')
    .action(generateCommand);

// Legacy command for backward compatibility
program
    .command('generate-iam')
    .description('[DEPRECATED] Use "generate" command instead')
    .option('-o, --output <path>', 'output directory', 'backend/infrastructure')
    .option('-u, --user <name>', 'deployment user name', 'frigg-deployment-user')
    .option('-s, --stack-name <name>', 'CloudFormation stack name', 'frigg-deployment-iam')
    .option('-v, --verbose', 'enable verbose output')
    .action((options) => {
        console.log('⚠️  The generate-iam command is deprecated. Using "generate" with AWS CloudFormation...');
        generateCommand({ ...options, provider: 'aws', format: 'cloudformation' });
    });

program
    .command('ui')
    .description('Start the Frigg Management UI')
    .option('-p, --port <number>', 'port number', '3001')
    .option('--no-open', 'do not open browser automatically')
    .option('-r, --repo <path>', 'path to Frigg repository')
    .option('--dev', 'run in development mode')
    .option('--app-path <path>', 'path to Frigg application directory')
    .option('--config <path>', 'path to Frigg configuration file')
    .option('--app <path>', 'alias for --app-path')
    .action(uiCommand);

program.parse(process.argv);

module.exports = { installCommand, startCommand, buildCommand, deployCommand, generateCommand, uiCommand };
