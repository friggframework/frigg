/**
 * Copyright (c) 2024 Frigg Integration Framework
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const chalk = require('chalk');
const spawn = require('cross-spawn');
const execSync = require('child_process').execSync;
const validateProjectName = require('validate-npm-package-name');
const semver = require('semver');
const FrameworkTemplateHandler = require('./framework-template-handler');
const BackendFirstHandler = require('./backend-first-handler');

function isUsingYarn() {
    return (process.env.npm_config_user_agent || '').indexOf('yarn') === 0;
}

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

function isInGitRepository() {
    try {
        execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
}

function tryGitInit() {
    try {
        execSync('git --version', { stdio: 'ignore' });
        if (isInGitRepository()) {
            return false;
        }

        execSync('git init', { stdio: 'ignore' });
        return true;
    } catch (e) {
        console.warn('Git repo not initialized', e);
        return false;
    }
}

function tryGitCommit(appPath) {
    try {
        execSync('git add -A', { stdio: 'ignore' });
        execSync('git commit -m "Initialize project using Frigg CLI"', {
            stdio: 'ignore',
        });
        return true;
    } catch (e) {
        console.warn('Git commit not created', e);
        console.warn('Removing .git directory...');
        try {
            fs.removeSync(path.join(appPath, '.git'));
        } catch (removeErr) {
            // Ignore.
        }
        return false;
    }
}

function isSafeToCreateProjectIn(root, name) {
    const validFiles = [
        '.DS_Store',
        '.git',
        '.gitattributes',
        '.gitignore',
        '.gitlab-ci.yml',
        '.hg',
        '.hgcheck',
        '.hgignore',
        '.idea',
        '.npmignore',
        '.travis.yml',
        'docs',
        'LICENSE',
        'README.md',
        'mkdocs.yml',
        'Thumbs.db',
    ];
    
    const errorLogFilePatterns = [
        'npm-debug.log',
        'yarn-error.log',
        'yarn-debug.log',
    ];
    
    const isErrorLog = file => {
        return errorLogFilePatterns.some(pattern => file.startsWith(pattern));
    };

    const conflicts = fs
        .readdirSync(root)
        .filter(file => !validFiles.includes(file))
        .filter(file => !/\.iml$/.test(file))
        .filter(file => !isErrorLog(file));

    if (conflicts.length > 0) {
        console.log(
            `The directory ${chalk.green(name)} contains files that could conflict:`
        );
        console.log();
        for (const file of conflicts) {
            try {
                const stats = fs.lstatSync(path.join(root, file));
                if (stats.isDirectory()) {
                    console.log(`  ${chalk.blue(`${file}/`)}`);
                } else {
                    console.log(`  ${file}`);
                }
            } catch (e) {
                console.log(`  ${file}`);
            }
        }
        console.log();
        console.log(
            'Either try using a new directory name, or remove the files listed above.'
        );

        return false;
    }

    // Remove any log files from a previous installation.
    fs.readdirSync(root).forEach(file => {
        if (isErrorLog(file)) {
            fs.removeSync(path.join(root, file));
        }
    });
    return true;
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

function getTemplateInstallPackage(template, originalDirectory) {
    let templateToInstall = '@friggframework/cfa-template';
    if (template) {
        if (template.match(/^file:/)) {
            templateToInstall = `file:${path.resolve(
                originalDirectory,
                template.match(/^file:(.*)?$/)[1]
            )}`;
        } else if (
            template.includes('://') ||
            template.match(/^.+\.(tgz|tar\.gz)$/)
        ) {
            templateToInstall = template;
        } else {
            templateToInstall = template;
        }
    }
    return templateToInstall;
}

async function installTemplate(root, templateToInstall, verbose, useYarn) {
    const allDependencies = [templateToInstall];
    
    console.log('Installing packages. This might take a couple of minutes.');
    console.log(
        `Installing ${chalk.cyan(templateToInstall)}...`
    );
    console.log();

    return new Promise((resolve, reject) => {
        let command;
        let args;
        
        if (useYarn) {
            command = 'yarnpkg';
            args = ['add', '--exact', '--cwd', root];
        } else {
            command = 'npm';
            args = [
                'install',
                '--no-audit',
                '--save',
                '--save-exact',
                '--loglevel',
                'error',
            ];
        }
        
        args = args.concat(allDependencies);
        
        if (verbose) {
            args.push('--verbose');
        }

        const child = spawn(command, args, {stdio: 'inherit', cwd: root});
        child.on('close', code => {
            if (code !== 0) {
                reject({
                    command: `${command} ${args.join(' ')}`,
                });
                return;
            }
            resolve();
        });
    });
}

async function applyTemplate(root, appName, templateName, verbose, useYarn) {
    const appPackage = require(path.join(root, 'package.json'));
    const templatePath = path.dirname(
        require.resolve(`${templateName}/package.json`, { paths: [root] })
    );

    const templateJsonPath = path.join(templatePath, 'template.json');
    let templateJson = {};
    if (fs.existsSync(templateJsonPath)) {
        templateJson = require(templateJsonPath);
    }

    const templatePackage = templateJson.package || {};

    // Keys to ignore in templatePackage
    const templatePackageBlacklist = [
        'name',
        'version',
        'description',
        'keywords',
        'bugs',
        'license',
        'author',
        'contributors',
        'files',
        'browser',
        'bin',
        'man',
        'directories',
        'repository',
        'peerDependencies',
        'bundledDependencies',
        'optionalDependencies',
        'engineStrict',
        'os',
        'cpu',
        'preferGlobal',
        'private',
        'publishConfig',
    ];

    // Keys from templatePackage that will be merged with appPackage
    const templatePackageToMerge = ['dependencies'];

    // Keys from templatePackage that will be added to appPackage
    const templatePackageToReplace = Object.keys(templatePackage).filter(key => {
        return (
            !templatePackageBlacklist.includes(key) &&
            !templatePackageToMerge.includes(key)
        );
    });

    // Copy over some of the devDependencies
    appPackage.dependencies = appPackage.dependencies || {};

    // Add templatePackage keys/values to appPackage, replacing existing entries
    templatePackageToReplace.forEach(key => {
        appPackage[key] = templatePackage[key];
    });

    fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify(appPackage, null, 2) + os.EOL
    );

    const readmeExists = fs.existsSync(path.join(root, 'README.md'));
    if (readmeExists) {
        fs.renameSync(
            path.join(root, 'README.md'),
            path.join(root, 'README.old.md')
        );
    }

    // Copy the files for the user
    const templateDir = path.join(templatePath, 'template');
    if (fs.existsSync(templateDir)) {
        fs.copySync(templateDir, root);
    } else {
        console.error(
            `Could not locate supplied template: ${chalk.green(templateDir)}`
        );
        throw new Error('Template directory not found');
    }

    // modifies README.md commands based on user used package manager.
    if (useYarn) {
        try {
            const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
            fs.writeFileSync(
                path.join(root, 'README.md'),
                readme.replace(/(npm run |npm )/g, 'yarn '),
                'utf8'
            );
        } catch (err) {
            // Silencing the error. As it fall backs to using default npm commands.
        }
    }

    const gitignoreExists = fs.existsSync(path.join(root, '.gitignore'));
    if (gitignoreExists) {
        // Append if there's already a `.gitignore` file there
        const data = fs.readFileSync(path.join(root, 'gitignore'));
        fs.appendFileSync(path.join(root, '.gitignore'), data);
        fs.unlinkSync(path.join(root, 'gitignore'));
    } else {
        // Rename gitignore after the fact to prevent npm from renaming it to .npmignore
        fs.moveSync(
            path.join(root, 'gitignore'),
            path.join(root, '.gitignore'),
            []
        );
    }

    // Install additional template dependencies
    const command = useYarn ? 'yarnpkg' : 'npm';
    const args = useYarn ? [] : ['install', '--no-audit'];
    
    console.log();
    console.log(`Installing template dependencies using ${command}...`);

    const proc = spawn.sync(command, args, { stdio: 'inherit', cwd: root });
    if (proc.status !== 0) {
        console.error(`\`${command} ${args.join(' ')}\` failed`);
        throw new Error('Failed to install dependencies');
    }

    // Remove template
    console.log(`Removing template package using ${command}...`);
    console.log();

    const removeCommand = useYarn ? 'remove' : 'uninstall';
    const removeProc = spawn.sync(command, [removeCommand, templateName], {
        stdio: 'inherit',
        cwd: root
    });
    if (removeProc.status !== 0) {
        console.error(`\`${command} ${removeCommand} ${templateName}\` failed`);
    }
}

async function initCommand(projectName, options) {
    const verbose = options.verbose || false;
    const framework = options.framework;
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
    
    // Legacy framework-first handler (for backwards compatibility)
    if (framework || options.legacyFrontend) {
        try {
            const templateHandler = new FrameworkTemplateHandler(root, {
                framework,
                force,
                verbose,
                includeBackend: options.backend !== false
            });
            
            await templateHandler.initialize();
            return;
        } catch (error) {
            console.log();
            console.log(chalk.red('Aborting installation.'));
            console.log(chalk.red('Error:'), error.message);
            console.log();
            process.exit(1);
        }
    }

    // Fallback to legacy template system for backward compatibility
    console.log(chalk.yellow('⚠️  Using legacy template system. Consider using the new framework-specific templates.'));
    
    fs.ensureDirSync(projectName);
    
    if (!isSafeToCreateProjectIn(root, projectName)) {
        process.exit(1);
    }
    
    console.log();
    console.log(`Creating a new Frigg App in ${chalk.green(root)}.`);
    console.log();

    const packageJson = {
        name: appName,
        version: '0.1.0',
        private: true,
        workspaces: [
            "backend",
            "frontend"
        ],
        devDependencies: {
            "concurrently": "^8.2.2"
        },
        scripts: {
            start: "concurrently \"cd backend && npm run backend-start\" \"cd frontend && npm run frontend-start\"",
            test: "npm test -workspaces"
        }
    };
    
    fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify(packageJson, null, 2) + os.EOL
    );

    const originalDirectory = process.cwd();
    process.chdir(root);
    
    const useYarn = isUsingYarn();
    const templateToInstall = getTemplateInstallPackage(options.template, originalDirectory);
    
    try {
        await installTemplate(root, templateToInstall, verbose, useYarn);
        await applyTemplate(root, appName, templateToInstall, verbose, useYarn);
        
        // Initialize git repo
        let initializedGit = false;
        if (tryGitInit()) {
            initializedGit = true;
            console.log();
            console.log('Initialized a git repository.');
        }

        // Create git commit if git repo was initialized
        if (initializedGit && tryGitCommit(root)) {
            console.log();
            console.log('Created git commit.');
        }

        // Display success message
        const displayedCommand = useYarn ? 'yarn' : 'npm';
        let cdpath;
        if (originalDirectory && path.join(originalDirectory, appName) === root) {
            cdpath = appName;
        } else {
            cdpath = root;
        }

        console.log();
        console.log(`Woohoo! Created a Frigg application code named: ${appName} at ${root}`);
        console.log('Inside that directory, you can run a few commands:');
        console.log();
        console.log(chalk.cyan(`  ${displayedCommand} start`));
        console.log('    Starts the development frontend and backend.');
        console.log();
        console.log(chalk.cyan(`  ${displayedCommand} test`));
        console.log('    Starts the test runner.');
        console.log();
        console.log(chalk.cyan(`  frigg build`));
        console.log('    Build the serverless application.');
        console.log();
        console.log(chalk.cyan(`  frigg deploy`));
        console.log('    Deploy the serverless application.');
        console.log();
        console.log('We suggest that you begin by typing:');
        console.log();
        console.log(chalk.cyan('  cd'), cdpath);
        console.log(`  ${chalk.cyan(`${displayedCommand} start`)}`);
        console.log();
        console.log('Happy integrating!');
        
    } catch (error) {
        console.log();
        console.log('Aborting installation.');
        if (error.command) {
            console.log(`  ${chalk.cyan(error.command)} has failed.`);
        } else {
            console.log(
                chalk.red('Unexpected error. Please report it as a bug:')
            );
            console.log(error);
        }
        console.log();

        // On 'exit' we will delete these files from target directory.
        const knownGeneratedFiles = ['package.json', 'node_modules', 'package-lock.json'];
        const currentFiles = fs.readdirSync(path.join(root));
        currentFiles.forEach(file => {
            knownGeneratedFiles.forEach(fileToMatch => {
                if (file === fileToMatch) {
                    console.log(`Deleting generated file... ${chalk.cyan(file)}`);
                    fs.removeSync(path.join(root, file));
                }
            });
        });
        const remainingFiles = fs.readdirSync(path.join(root));
        if (!remainingFiles.length) {
            console.log(
                `Deleting ${chalk.cyan(`${appName}/`)} from ${chalk.cyan(
                    path.resolve(root, '..')
                )}`
            );
            process.chdir(path.resolve(root, '..'));
            fs.removeSync(path.join(root));
        }
        console.log('Done.');
        process.exit(1);
    }
}

module.exports = { initCommand };