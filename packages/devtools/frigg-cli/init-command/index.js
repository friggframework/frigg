/**
 * Copyright (c) 2024 Frigg Integration Framework
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const path = require('path');
const chalk = require('chalk');
const validateProjectName = require('validate-npm-package-name');
const semver = require('semver');
const BackendFirstHandler = require('./backend-first-handler');

function checkAppName(appName) {
    const validationResult = validateProjectName(appName);
    if (!validationResult.validForNewPackages) {
        console.error(
            chalk.red(
                `Cannot create a project named ${chalk.green(
                    `"${appName}"`
                )} because of npm naming restrictions:\n`
            )
        );
        [
            ...(validationResult.errors || []),
            ...(validationResult.warnings || []),
        ].forEach(error => {
            console.error(chalk.red(`  * ${error}`));
        });
        console.error(chalk.red('\nPlease choose a different project name.'));
        process.exit(1);
    }
}

function checkNodeVersion() {
    const unsupportedNodeVersion = !semver.satisfies(
        semver.coerce(process.version),
        '>=14'
    );

    if (unsupportedNodeVersion) {
        console.log(
            chalk.yellow(
                `You are using Node ${process.version} so the project will be bootstrapped with an old unsupported version of tools.\n\n` +
                `Please update to Node 14 or higher for a better, fully supported experience.\n`
            )
        );
    }
}

async function initCommand(projectName, options) {
    const verbose = options.verbose || false;
    const force = options.force || false;
    
    checkNodeVersion();

    const root = path.resolve(projectName);
    const appName = path.basename(root);

    checkAppName(appName);
    
    // Use backend-first handler by default
    if (!options.template && !options.legacyFrontend) {
        try {
            const handler = new BackendFirstHandler(root, {
                force,
                verbose,
                mode: options.mode,
                frontend: options.frontend
            });
            
            await handler.initialize();
            return;
        } catch (error) {
            console.log();
            console.log(chalk.red('Aborting installation.'));
            console.log(chalk.red('Error:'), error.message);
            console.log();
            process.exit(1);
        }
    }
    
    // If we get here, show an error for legacy options
    console.log();
    console.log(chalk.red('Legacy template system is no longer supported.'));
    console.log(chalk.yellow('Please use the new backend-first approach.'));
    console.log();
    process.exit(1);
}

module.exports = { initCommand };