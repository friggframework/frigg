#!/usr/bin/env node

const { Command } = require('commander');
const { installCommand } = require('./installCommand');

const program = new Command();
program
    .command('install [apiModuleName]')
    .description('Install an API module')
    .action(installCommand);

program.parse(process.argv);

module.exports = { installCommand };
