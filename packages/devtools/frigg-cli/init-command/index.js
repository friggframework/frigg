/**
 * Copyright (c) 2024 Frigg Integration Framework
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const path = require('path');
const chalk = require('chalk');
const fs = require('fs-extra');
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
    
    // Handle non-interactive mode flags
    const nonInteractive = options.nonInteractive || options['no-interactive'] || options.yes || false;
    const interactive = !nonInteractive;
    
    checkNodeVersion();

    const root = path.resolve(projectName);
    const appName = path.basename(root);

    checkAppName(appName);
    
    // Load configuration from file if provided
    let configFromFile = {};
    if (options.config) {
        try {
            const configPath = path.resolve(options.config);
            if (await fs.pathExists(configPath)) {
                configFromFile = await fs.readJSON(configPath);
            } else {
                console.log(chalk.yellow(`Warning: Config file not found: ${configPath}`));
            }
        } catch (error) {
            console.log(chalk.yellow(`Warning: Could not load config file: ${error.message}`));
        }
    }
    
    // Merge options with environment variables and config file
    const mergedOptions = {
        force,
        verbose,
        mode: options.mode || process.env.FRIGG_DEPLOYMENT_MODE || configFromFile.deploymentMode,
        frontend: options.frontend !== undefined ? options.frontend : 
                 process.env.FRIGG_INCLUDE_FRONTEND !== undefined ? process.env.FRIGG_INCLUDE_FRONTEND === 'true' :
                 configFromFile.includeFrontend,
        interactive,
        nonInteractive,
        appPurpose: options.appPurpose || process.env.FRIGG_APP_PURPOSE || configFromFile.appPurpose,
        includeIntegrations: options.includeIntegrations !== undefined ? options.includeIntegrations :
                            process.env.FRIGG_INCLUDE_INTEGRATIONS !== undefined ? process.env.FRIGG_INCLUDE_INTEGRATIONS === 'true' :
                            configFromFile.includeIntegrations,
        includeApiModule: options.includeApiModule !== undefined ? options.includeApiModule :
                         process.env.FRIGG_INCLUDE_API_MODULE !== undefined ? process.env.FRIGG_INCLUDE_API_MODULE === 'true' :
                         configFromFile.includeApiModule,
        serverlessProvider: options.serverlessProvider || process.env.FRIGG_SERVERLESS_PROVIDER || configFromFile.serverlessProvider,
        installDependencies: options.installDeps !== undefined ? options.installDeps :
                            process.env.FRIGG_INSTALL_DEPS !== undefined ? process.env.FRIGG_INSTALL_DEPS === 'true' :
                            configFromFile.installDependencies,
        initializeGit: options.initGit !== undefined ? options.initGit :
                      process.env.FRIGG_INIT_GIT !== undefined ? process.env.FRIGG_INIT_GIT === 'true' :
                      configFromFile.initializeGit,
        starterIntegrations: process.env.FRIGG_STARTER_INTEGRATIONS ? 
                            process.env.FRIGG_STARTER_INTEGRATIONS.split(',').map(s => s.trim()) :
                            configFromFile.starterIntegrations,
        frontendFramework: process.env.FRIGG_FRONTEND_FRAMEWORK || configFromFile.frontendFramework,
        demoAuthMode: process.env.FRIGG_DEMO_AUTH_MODE || configFromFile.demoAuthMode
    };
    
    // Use backend-first handler by default
    if (!options.template && !options.legacyFrontend) {
        try {
            const handler = new BackendFirstHandler(root, mergedOptions);
            
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