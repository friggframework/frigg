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
const { DEPLOYMENT_MODES } = require('./deployment-modes');

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
        ].forEach((error) => {
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

async function initCommand(projectName, options = {}) {
    const verbose = options.verbose || false;
    const force = options.force || false;

    checkNodeVersion();

    // The legacy template system was removed; reject it before doing anything.
    if (options.template) {
        console.log();
        console.log(
            chalk.red('Legacy template system is no longer supported.')
        );
        console.log(
            chalk.yellow(
                `Run ${chalk.cyan(
                    'frigg init <project-name>'
                )} without --template.`
            )
        );
        console.log();
        process.exit(1);
        return;
    }

    // Accept the project name from the positional argument or the --name flag.
    const targetName = projectName || options.name;
    if (!targetName) {
        console.error(
            chalk.red(
                'Please specify a project name:\n' +
                    `  ${chalk.cyan('frigg init')} ${chalk.green(
                        '<project-name>'
                    )}\n`
            )
        );
        process.exit(1);
        return;
    }

    if (options.mode && !DEPLOYMENT_MODES.includes(options.mode)) {
        console.error(
            chalk.red(
                `Invalid --mode "${
                    options.mode
                }". Expected one of: ${DEPLOYMENT_MODES.join(', ')}`
            )
        );
        process.exit(1);
        return;
    }

    const root = path.resolve(targetName);
    const appName = path.basename(root);

    checkAppName(appName);

    try {
        const handler = new BackendFirstHandler(root, {
            force,
            verbose,
            mode: options.mode,
            yes: options.yes || false,
            install: options.install,
            git: options.git,
        });

        await handler.initialize();
    } catch (error) {
        console.log();
        console.log(chalk.red('Aborting installation.'));
        console.log(chalk.red('Error:'), error.message);
        console.log();
        process.exit(1);
    }
}

module.exports = { initCommand };
