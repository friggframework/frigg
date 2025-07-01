/**
 * Copyright (c) 2024 Frigg Integration Framework
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const chalk = require('chalk');
const path = require('path');
const { 
    discoverFriggRepositories, 
    getCurrentRepositoryInfo,
    formatRepositoryInfo,
    isFriggRepository
} = require('../utils/repo-detection');

/**
 * Lists all discovered Frigg repositories
 */
async function listRepositories(options = {}) {
    const { json = false } = options;
    
    if (!json) {
        console.log(chalk.blue('Discovering Frigg repositories...'));
    }
    
    const repositories = await discoverFriggRepositories(options);
    
    if (json) {
        console.log(JSON.stringify(repositories, null, 2));
        return;
    }
    
    if (repositories.length === 0) {
        console.log(chalk.yellow('No Frigg repositories found.'));
        console.log(chalk.gray('To create a new Frigg project, run: frigg init <project-name>'));
        return;
    }
    
    console.log(chalk.green(`Found ${repositories.length} Frigg repositories:`));
    console.log();
    
    repositories.forEach((repo, index) => {
        const isCurrentRepo = process.cwd().startsWith(repo.path);
        const marker = isCurrentRepo ? chalk.cyan('→') : ' ';
        
        console.log(`${marker} ${formatRepositoryInfo(repo)}`);
        console.log(`   ${chalk.gray(repo.path)}`);
        
        // Show detection reasons
        const detectionReasons = [];
        if (repo.friggDependencies && repo.friggDependencies.length > 0) {
            detectionReasons.push(`Dependencies: ${repo.friggDependencies.join(', ')}`);
        }
        if (repo.hasFriggConfig) {
            detectionReasons.push('Has Frigg config file');
        }
        if (repo.hasFriggDirectories) {
            detectionReasons.push('Has Frigg directories');
        }
        if (repo.hasFriggScripts) {
            detectionReasons.push('Has Frigg scripts');
        }
        if (repo.isZapierApp) {
            detectionReasons.push(chalk.yellow('[Zapier App]'));
        }
        
        if (detectionReasons.length > 0) {
            console.log(`   ${chalk.gray('Detected by:')} ${detectionReasons.join(', ')}`);
        }
        
        console.log();
    });
}

/**
 * Shows detailed information about the current repository
 */
async function showCurrentRepository() {
    console.log(chalk.blue('Analyzing current directory...'));
    
    const currentRepo = await getCurrentRepositoryInfo();
    
    if (!currentRepo) {
        console.log(chalk.yellow('Current directory is not part of a Frigg repository.'));
        console.log(chalk.gray('To create a new Frigg project, run: frigg init <project-name>'));
        return;
    }
    
    console.log(chalk.green('✓ Current directory is part of a Frigg repository:'));
    console.log();
    
    console.log(`${chalk.cyan('Name:')} ${currentRepo.name}`);
    console.log(`${chalk.cyan('Path:')} ${currentRepo.path}`);
    console.log(`${chalk.cyan('Version:')} ${currentRepo.version || 'unknown'}`);
    console.log(`${chalk.cyan('Framework:')} ${currentRepo.framework}`);
    console.log(`${chalk.cyan('Has Backend:')} ${currentRepo.hasBackend ? 'Yes' : 'No'}`);
    
    if (currentRepo.currentSubPath) {
        console.log(`${chalk.cyan('Current Subdirectory:')} ${currentRepo.currentSubPath}`);
    }
    
    if (currentRepo.friggDependencies && currentRepo.friggDependencies.length > 0) {
        console.log(`${chalk.cyan('Frigg Dependencies:')}`);
        currentRepo.friggDependencies.forEach(dep => {
            console.log(`  - ${dep}`);
        });
    }
    
    if (currentRepo.workspaces) {
        console.log(`${chalk.cyan('Workspaces:')}`);
        const workspaces = Array.isArray(currentRepo.workspaces) 
            ? currentRepo.workspaces 
            : currentRepo.workspaces.packages || [];
        workspaces.forEach(workspace => {
            console.log(`  - ${workspace}`);
        });
    }
}

/**
 * Validates if a given path is a Frigg repository
 */
async function validateRepository(repoPath) {
    const absolutePath = path.resolve(repoPath);
    
    console.log(chalk.blue(`Validating repository: ${absolutePath}`));
    
    const { isFriggRepo, repoInfo } = await isFriggRepository(absolutePath);
    
    if (isFriggRepo) {
        console.log(chalk.green('✓ Valid Frigg repository'));
        console.log(`  Name: ${repoInfo.name}`);
        console.log(`  Framework: ${repoInfo.framework}`);
        console.log(`  Has Backend: ${repoInfo.hasBackend ? 'Yes' : 'No'}`);
        if (repoInfo.friggDependencies.length > 0) {
            console.log(`  Dependencies: ${repoInfo.friggDependencies.join(', ')}`);
        }
    } else {
        console.log(chalk.red('✗ Not a valid Frigg repository'));
        console.log(chalk.gray('Directory does not contain Frigg project indicators.'));
    }
}

/**
 * Main repos command handler
 */
async function reposCommand(action, options = {}) {
    try {
        switch (action) {
            case 'list':
                await listRepositories(options);
                break;
            case 'current':
                await showCurrentRepository();
                break;
            case 'validate':
                if (!options.path) {
                    console.log(chalk.red('Error: --path is required for validate action'));
                    process.exit(1);
                }
                await validateRepository(options.path);
                break;
            default:
                // Default to list if no action specified
                await listRepositories(options);
        }
    } catch (error) {
        if (options.json) {
            console.log(JSON.stringify({ error: error.message }, null, 2));
        } else {
            console.error(chalk.red('Error:'), error.message);
        }
        process.exit(1);
    }
}

module.exports = { reposCommand, listRepositories, showCurrentRepository, validateRepository };