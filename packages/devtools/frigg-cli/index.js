#!/usr/bin/env node

const { Command } = require('commander');
const { initCommand } = require('./init-command');
const { installCommand } = require('./install-command');
const { startCommand } = require('./start-command'); // Assuming you have a startCommand module
const { buildCommand } = require('./build-command');
const { deployCommand } = require('./deploy-command');
const { generateIamCommand } = require('./generate-iam-command');
const { uiCommand } = require('./ui-command');

const program = new Command();

program
    .command('init [projectName]')
    .description('Initialize a new Frigg application')
    .option('-m, --mode <mode>', 'deployment mode (embedded|standalone)')
    .option('--frontend', 'include demo frontend')
    .option('--no-frontend', 'skip demo frontend')
    .option('--no-interactive', 'run without interactive prompts')
    .option('-f, --force', 'overwrite existing directory')
    .option('-v, --verbose', 'enable verbose output')
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
    .action(buildCommand);

program
    .command('deploy')
    .description('Deploy the serverless application')
    .option('-s, --stage <stage>', 'deployment stage', 'dev')
    .option('-v, --verbose', 'enable verbose output')
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

if (require.main === module) {
    program.parse(process.argv);
}

module.exports = {
    program,
    initCommand,
    installCommand,
    startCommand,
    buildCommand,
    deployCommand,
    generateIamCommand,
    uiCommand
};
