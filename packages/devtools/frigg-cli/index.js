#!/usr/bin/env node

const {
    findNearestBackendPackageJson,
    validateBackendPath,
} = require('./backendPath');
const { logInfo, logError } = require('./logger');
const { installPackage } = require('./installPackage');
const { createIntegrationFile } = require('./integrationFile');
const { updateBackendJsFile } = require('./backendJs');
const { validatePackageExists, searchPackages } = require('./validatePackage');
const { commitChanges } = require('./commitChanges');
const { Command } = require('commander');
const inquirer = require('inquirer');
const { resolve } = require('node:path');
const fs = require('fs');
const dotenv = require('dotenv');
const { readFileSync, writeFileSync, existsSync } = require('fs');

const installCommand = async (apiModuleName) => {
    try {
        const searchResults = await searchPackages(apiModuleName);

        if (searchResults.length === 0) {
            logError(`No packages found matching ${apiModuleName}`);
            process.exit(1);
        }

        const filteredResults = searchResults.filter((pkg) => {
            const version = pkg.version
                ? pkg.version.split('.').map(Number)
                : [];
            return version[0] >= 1;
        });

        if (filteredResults.length === 0) {
            const earlierVersions = searchResults
                .map((pkg) => `${pkg.name} (${pkg.version})`)
                .join(', ');
            logError(
                `No packages found with version 1.0.0 or above for ${apiModuleName}. Found earlier versions: ${earlierVersions}`
            );
            process.exit(1);
        }

        const { selectedPackage } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedPackage',
                message: 'Select the package to install:',
                choices: filteredResults.map(
                    (pkg) => `${pkg.name} (${pkg.version})`
                ),
            },
        ]);

        const packageName = selectedPackage.split(' ')[0];
        await validatePackageExists(packageName);
        const backendPath = findNearestBackendPackageJson();
        validateBackendPath(backendPath);
        installPackage(backendPath, packageName);

        const modulePath = resolve(
            backendPath,
            `../../node_modules/${packageName}`
        );
        const {
            Config: { label },
            Definition,
        } = require(modulePath);

        createIntegrationFile(backendPath, label);
        updateBackendJsFile(backendPath, label);
        commitChanges(backendPath, label);
        logInfo(
            `Successfully installed ${packageName} and updated the project.`
        );

        // Extract and handle environment variables
        logInfo('Searching for missing environment variables...');
        if (Definition && Definition.env) {
            const envVars = Object.keys(Definition.env);
            const localEnvPath = resolve(backendPath, '../.env');
            const localDevConfigPath = resolve(
                backendPath,
                '../src/configs/dev.json'
            );

            // Load local .env variables
            let localEnvVars = {};
            if (existsSync(localEnvPath)) {
                localEnvVars = dotenv.parse(readFileSync(localEnvPath, 'utf8'));
            } else {
                logInfo('.env file not found, creating a new one.');
                fs.writeFileSync(localEnvPath, '');
            }

            // Load local dev.json variables
            let localDevConfig = {};
            if (existsSync(localDevConfigPath)) {
                localDevConfig = JSON.parse(
                    readFileSync(localDevConfigPath, 'utf8')
                );
            } else {
                logInfo('dev.json file not found, creating a new one.');
                fs.writeFileSync(
                    localDevConfigPath,
                    JSON.stringify({}, null, 2)
                );
            }

            const missingEnvVars = envVars.filter(
                (envVar) => !localEnvVars[envVar] && !localDevConfig[envVar]
            );

            logInfo(
                `Missing environment variables: ${missingEnvVars.join(', ')}`
            );

            if (missingEnvVars.length > 0) {
                const { addEnvVars } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'addEnvVars',
                        message: `The following environment variables are required: ${missingEnvVars.join(
                            ', '
                        )}. Do you want to add them now?`,
                    },
                ]);

                if (addEnvVars) {
                    const envValues = {};
                    for (const envVar of missingEnvVars) {
                        const { value } = await inquirer.prompt([
                            {
                                type: 'input',
                                name: 'value',
                                message: `Enter value for ${envVar}:`,
                            },
                        ]);
                        envValues[envVar] = value;
                    }

                    // Add the envValues to the local .env file
                    const envContent = Object.entries(envValues)
                        .map(([key, value]) => `${key}=${value}`)
                        .join('\n');
                    fs.appendFileSync(localEnvPath, `\n${envContent}`);

                    // Optionally, add the envValues to the local dev.json file
                    const updatedDevConfig = {
                        ...localDevConfig,
                        ...envValues,
                    };
                    writeFileSync(
                        localDevConfigPath,
                        JSON.stringify(updatedDevConfig, null, 2)
                    );
                } else {
                    logInfo("Edit whenever you're able, safe travels friend!");
                }
            }
        }
    } catch (error) {
        logError('An error occurred:', error);
        process.exit(1);
    }
};

const program = new Command();
program
    .command('install <apiModuleName>')
    .description('Install an API module')
    .action(installCommand);

program.parse(process.argv);

module.exports = { installCommand };
