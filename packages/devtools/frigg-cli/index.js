#!/usr/bin/env node

const { Command } = require('commander');
const { installCommand } = require('./install-command');
const { startCommand } = require('./start-command'); // Assuming you have a startCommand module

const program = new Command();
program
    .command('install [apiModuleName]')
    .description('Install an API module')
    .action(installCommand);

program
    .command('start')
    .description('Run the backend and optional frontend')
    .action(startCommand);

program.parse(process.argv);

module.exports = { installCommand, startCommand };
