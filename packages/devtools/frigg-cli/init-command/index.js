/**
 * Copyright (c) 2024 Frigg Integration Framework
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');
const validateProjectName = require('validate-npm-package-name');
const semver = require('semver');
const { input, confirm, select } = require('@inquirer/prompts');
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

    // Handle project name and directory resolution with validation
    const projectInfo = await resolveProjectInfo(projectName, options, force);
    const root = projectInfo.targetPath;
    const appName = projectInfo.appName;

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

/**
 * Resolve project name and target directory with user prompts and validation
 */
async function resolveProjectInfo(projectName, options, force) {
    let targetName = projectName;
    let targetDirectory;
    let useCurrentDirectory = false;

    // Check if we have a project name from any source
    if (!targetName) {
        targetName = options.name || options.directory;
    }

    // Detect existing Frigg projects in current directory
    const currentDirInfo = await detectFriggProject(process.cwd());

    if (currentDirInfo.isFriggProject && !force) {
        console.log(chalk.yellow('\n⚠️  Found existing Frigg project in current directory:'));
        console.log(chalk.gray(`   Type: ${currentDirInfo.projectType}`));
        console.log(chalk.gray(`   Name: ${currentDirInfo.projectName}`));

        const shouldContinue = await confirm({
            message: 'Do you want to create a new project anyway?',
            default: false
        });

        if (!shouldContinue) {
            console.log(chalk.blue('\n👍 No problem! Use the existing project or try a different directory.'));
            process.exit(0);
        }
    }

    // If no project name provided, prompt for it
    if (!targetName) {
        const directoryChoice = await select({
            message: 'Where would you like to create the project?',
            choices: [
                {
                    name: 'In current directory',
                    value: 'current',
                    description: `Create project files in ${process.cwd()}`
                },
                {
                    name: 'In new subdirectory',
                    value: 'subdirectory',
                    description: 'Create a new folder for the project'
                }
            ],
            default: 'subdirectory'
        });

        if (directoryChoice === 'current') {
            useCurrentDirectory = true;
            targetName = path.basename(process.cwd());
            targetDirectory = process.cwd();
        } else {
            targetName = await input({
                message: 'What is your project name?',
                default: 'my-frigg-app',
                validate: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Project name is required';
                    }
                    const validation = validateProjectName(value.trim());
                    if (!validation.validForNewPackages) {
                        const errors = [
                            ...(validation.errors || []),
                            ...(validation.warnings || [])
                        ];
                        return `Invalid project name: ${errors.join(', ')}`;
                    }
                    return true;
                }
            });
        }
    }

    // Determine target directory if not already set
    if (!targetDirectory) {
        if (options.directory) {
            targetDirectory = path.resolve(options.directory);
        } else {
            targetDirectory = path.resolve(targetName);
        }
    }

    const appName = path.basename(targetDirectory);

    // Check if target directory exists and handle conflicts
    const directoryExists = await fs.pathExists(targetDirectory);
    if (directoryExists && !useCurrentDirectory) {
        const files = await fs.readdir(targetDirectory);
        const allowedFiles = ['.git', '.gitignore', 'README.md', '.DS_Store', 'LICENSE'];
        const conflictingFiles = files.filter(f => !allowedFiles.includes(f));

        if (conflictingFiles.length > 0 && !force) {
            console.log(chalk.yellow(`\n⚠️  Directory '${path.basename(targetDirectory)}' exists and is not empty:`));
            console.log(chalk.gray(`   Found: ${conflictingFiles.slice(0, 5).join(', ')}${conflictingFiles.length > 5 ? '...' : ''}`));

            const action = await select({
                message: 'How would you like to proceed?',
                choices: [
                    {
                        name: 'Choose a different name',
                        value: 'rename',
                        description: 'Pick a new project name'
                    },
                    {
                        name: 'Overwrite (dangerous)',
                        value: 'overwrite',
                        description: 'Continue anyway - may overwrite existing files'
                    },
                    {
                        name: 'Cancel',
                        value: 'cancel',
                        description: 'Stop and exit'
                    }
                ]
            });

            if (action === 'cancel') {
                console.log(chalk.blue('\n👍 Cancelled. No files were modified.'));
                process.exit(0);
            } else if (action === 'rename') {
                const newName = await input({
                    message: 'Enter a new project name:',
                    default: `${targetName}-new`,
                    validate: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'Project name is required';
                        }
                        const validation = validateProjectName(value.trim());
                        if (!validation.validForNewPackages) {
                            const errors = [
                                ...(validation.errors || []),
                                ...(validation.warnings || [])
                            ];
                            return `Invalid project name: ${errors.join(', ')}`;
                        }
                        return true;
                    }
                });

                return resolveProjectInfo(newName.trim(), options, force);
            }
            // If overwrite is chosen, we continue with force = true behavior
        }
    }

    return {
        targetPath: targetDirectory,
        appName: appName,
        useCurrentDirectory: useCurrentDirectory
    };
}

/**
 * Detect if current directory contains a Frigg project
 */
async function detectFriggProject(directory) {
    const result = {
        isFriggProject: false,
        projectType: null,
        projectName: null
    };

    try {
        // Check for package.json with Frigg dependencies
        const packageJsonPath = path.join(directory, 'package.json');
        if (await fs.pathExists(packageJsonPath)) {
            const packageJson = await fs.readJSON(packageJsonPath);
            const deps = {
                ...packageJson.dependencies,
                ...packageJson.devDependencies
            };

            if (deps['@friggframework/core'] ||
                Object.keys(deps).some(dep => dep.startsWith('@friggframework/'))) {
                result.isFriggProject = true;
                result.projectType = 'Frigg Application';
                result.projectName = packageJson.name;
                return result;
            }
        }

        // Check for Frigg-specific files
        const friggFiles = [
            'frigg.config.js',
            'frigg-integration',
            'index.js' // Check if it contains Frigg app definition
        ];

        for (const file of friggFiles) {
            const filePath = path.join(directory, file);
            if (await fs.pathExists(filePath)) {
                if (file === 'index.js') {
                    // Check if it's a Frigg app definition
                    const content = await fs.readFile(filePath, 'utf8');
                    if (content.includes('appDefinition') &&
                        (content.includes('@friggframework') || content.includes('frigg'))) {
                        result.isFriggProject = true;
                        result.projectType = 'Frigg Application';
                        result.projectName = path.basename(directory);
                        return result;
                    }
                } else {
                    result.isFriggProject = true;
                    result.projectType = file === 'frigg-integration' ? 'Frigg Integration' : 'Frigg Application';
                    result.projectName = path.basename(directory);
                    return result;
                }
            }
        }

        // Check for serverless.yml with Frigg functions
        const serverlessPath = path.join(directory, 'serverless.yml');
        if (await fs.pathExists(serverlessPath)) {
            const content = await fs.readFile(serverlessPath, 'utf8');
            if (content.includes('frigg') || content.includes('@friggframework')) {
                result.isFriggProject = true;
                result.projectType = 'Serverless Frigg Application';
                result.projectName = path.basename(directory);
                return result;
            }
        }

    } catch (error) {
        // Ignore errors in detection - we'll just assume it's not a Frigg project
    }

    return result;
}

module.exports = { initCommand, detectFriggProject };