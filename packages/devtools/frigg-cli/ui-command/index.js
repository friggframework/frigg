const open = require('open');
const chalk = require('chalk');
const path = require('path');
const ProcessManager = require('../utils/process-manager');
const {
    getCurrentRepositoryInfo,
    discoverFriggRepositories,
    promptRepositorySelection,
    formatRepositoryInfo
} = require('../utils/repo-detection');

async function uiCommand(options) {
    const { port = 3210, open: shouldOpen = true, repo: specifiedRepo, dev = false } = options;

    // Fix: --no-open should set open to false, not use the default true
    const shouldOpenBrowser = options.open !== false;

    let targetRepo = null;
    let workingDirectory = process.cwd();

    // If a specific repo path is provided, use it
    if (specifiedRepo) {
        const repoPath = path.resolve(specifiedRepo);
        console.log(chalk.blue(`Using specified repository: ${repoPath}`));
        workingDirectory = repoPath;
        targetRepo = { path: repoPath, name: path.basename(repoPath) };
    } else {
        // Check if we're already in a Frigg repository
        console.log(chalk.blue('Detecting Frigg repository...'));
        const currentRepo = await getCurrentRepositoryInfo();

        if (currentRepo) {
            console.log(chalk.green(`✓ Found Frigg repository: ${formatRepositoryInfo(currentRepo)}`));
            if (currentRepo.currentSubPath) {
                console.log(chalk.gray(`  Currently in subdirectory: ${currentRepo.currentSubPath}`));
            }
            targetRepo = currentRepo;
            workingDirectory = currentRepo.path;
        } else {
            // Discover Frigg repositories
            console.log(chalk.yellow('Current directory is not a Frigg repository.'));
            console.log(chalk.blue('Searching for Frigg repositories...'));

            const discoveredRepos = await discoverFriggRepositories();

            if (discoveredRepos.length === 0) {
                console.log(chalk.red('No Frigg repositories found. Please create one first.'));
                process.exit(1);
            }

            // For UI command, we'll let the UI handle repository selection
            // Set a placeholder and pass the discovered repos via environment
            targetRepo = {
                name: 'Multiple Repositories Available',
                path: process.cwd(),
                isMultiRepo: true,
                availableRepos: discoveredRepos
            };
            workingDirectory = process.cwd();

            console.log(chalk.blue(`Found ${discoveredRepos.length} Frigg repositories. You'll be able to select one in the UI.`));
        }
    }

    console.log(chalk.blue('🚀 Starting Frigg Management UI...'));

    const processManager = new ProcessManager();

    try {
        const managementUiPath = path.join(__dirname, '../../management-ui');

        // Check if we're in development mode
        // For CLI usage, we prefer development mode unless explicitly set to production
        const fs = require('fs');
        const isDevelopment = dev || process.env.NODE_ENV !== 'production';

        if (isDevelopment) {
            const env = {
                ...process.env,
                VITE_API_URL: `http://localhost:${port}`,
                PORT: port,
                PROJECT_ROOT: workingDirectory,
                REPOSITORY_INFO: JSON.stringify(targetRepo),
                AVAILABLE_REPOSITORIES: targetRepo.isMultiRepo ? JSON.stringify(targetRepo.availableRepos) : null
            };

            // Start backend server with nodemon for auto-restart
            processManager.spawnProcess(
                'backend',
                'npm',
                ['run', 'server:dev'],
                { cwd: managementUiPath, env }
            );

            // Start frontend dev server
            processManager.spawnProcess(
                'frontend',
                'npm',
                ['run', 'dev'],
                { cwd: managementUiPath, env }
            );

            // Wait for backend to be ready by polling health endpoint
            const maxAttempts = 20;
            const delayMs = 250;
            let backendReady = false;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                try {
                    const response = await fetch(`http://localhost:${port}/api/health`);
                    if (response.ok) {
                        backendReady = true;
                        break;
                    }
                } catch (err) {
                    // Backend not ready yet, wait and retry
                }
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }

            if (!backendReady) {
                console.warn('⚠️  Backend health check timed out, but continuing anyway...');
            }

            // Display clean status
            processManager.printStatus(
                'http://localhost:5173',
                `http://localhost:${port}`,
                targetRepo.name
            );

            // Open browser if requested
            if (shouldOpenBrowser) {
                setTimeout(() => {
                    open('http://localhost:5173');
                }, 1000);
            }

        } else {
            // Production mode - just start the backend server
            const { FriggManagementServer } = await import('../../management-ui/server/index.js');

            const server = new FriggManagementServer({
                port,
                projectRoot: workingDirectory,
                repositoryInfo: targetRepo,
                availableRepositories: targetRepo.isMultiRepo ? targetRepo.availableRepos : null
            });
            await server.start();

            processManager.printStatus(
                `http://localhost:${port}`,
                `http://localhost:${port}/api`,
                targetRepo.name
            );

            if (shouldOpenBrowser) {
                setTimeout(() => {
                    open(`http://localhost:${port}`);
                }, 1000);
            }
        }

        // Keep the process running
        process.stdin.resume();

    } catch (error) {
        console.error(chalk.red('Failed to start Management UI:'), error.message);
        if (error.code === 'EADDRINUSE') {
            console.log(chalk.yellow(`Port ${port} is already in use. Try using a different port with --port <number>`));
        }
        process.exit(1);
    }
}

module.exports = { uiCommand };