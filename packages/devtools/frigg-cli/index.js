#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const { displayFullHelp, displayHeader, displayQuickHelp } = require('./utils/cli-help');
const { scheduleUpdateCheck } = require('./utils/update-check');
const { showInteractiveHelp } = require('./utils/interactive-menu');

// Check for updates in background
scheduleUpdateCheck();

const program = new Command();

program
    .command('init <project-name>')
    .description('Create a new Frigg backend application')
    .option('-m, --mode <mode>', 'Deployment mode: embedded or standalone (default: interactive)')
    .option('--no-frontend', 'Skip demo frontend prompt')
    .option('--frontend', 'Include demo frontend (will prompt for framework)')
    .option('--force', 'Overwrite existing files')
    .option('-v, --verbose', 'Enable verbose output')
    .option('--legacy-frontend', 'Use legacy frontend-first initialization')
    .option('-f, --framework <framework>', '[Legacy] Frontend framework (use with --legacy-frontend)')
    .option('-t, --template <template>', '[Legacy] Template name')
    .addHelpText('after', `
Examples:
  $ frigg init my-app
  $ frigg init my-app --mode standalone
  $ frigg init my-app --frontend
  $ frigg init my-backend --no-frontend`)
    .action((...args) => {
        const { initCommand } = require('./init-command');
        return initCommand(...args);
    });

program
    .command('install [apiModuleName]')
    .description('Install an API module')
    .addHelpText('after', `
Examples:
  $ frigg install              # Interactive mode
  $ frigg install slack        # Install Slack integration
  $ frigg install github       # Install GitHub integration`)
    .action((...args) => {
        const { installCommand } = require('./install-command');
        return installCommand(...args);
    });

program
    .command('start')
    .description('Run the backend and optional frontend')
    .option('-s, --stage <stage>', 'deployment stage', 'dev')
    .option('-v, --verbose', 'enable verbose output')
    .action((...args) => {
        const { startCommand } = require('./start-command');
        return startCommand(...args);
    });

program
    .command('build')
    .description('Build the serverless application')
    .option('-s, --stage <stage>', 'deployment stage', 'dev')
    .option('-v, --verbose', 'enable verbose output')
    .action((...args) => {
        const { buildCommand } = require('./build-command');
        return buildCommand(...args);
    });

program
    .command('deploy')
    .description('Deploy the serverless application')
    .option('-s, --stage <stage>', 'deployment stage', 'dev')
    .option('-v, --verbose', 'enable verbose output')
    .action((...args) => {
        const { deployCommand } = require('./deploy-command');
        return deployCommand(...args);
    });

program
    .command('generate-iam')
    .description('Generate IAM CloudFormation template based on app definition')
    .option('-o, --output <path>', 'output directory', 'backend/infrastructure')
    .option('-u, --user <name>', 'deployment user name', 'frigg-deployment-user')
    .option('-s, --stack-name <name>', 'CloudFormation stack name', 'frigg-deployment-iam')
    .option('-v, --verbose', 'enable verbose output')
    .action((...args) => {
        const { generateIamCommand } = require('./generate-iam-command');
        return generateIamCommand(...args);
    });

program
    .command('generate <type> <name>')
    .description('Generate Frigg components (api-module, etc.)')
    .option('-p, --path <path>', 'output directory path')
    .option('--from-spec <url>', 'generate from OpenAPI/Swagger spec URL')
    .option('--auth <type>', 'authentication type (oauth2, apiKey, basic, custom)')
    .action((type, name, options) => {
        if (type === 'api-module' || type === 'api') {
            const { generateApiModule } = require('./generate-api-module-command');
            generateApiModule(name, options);
        } else {
            console.error(`Unknown generate type: ${type}. Supported types: api-module`);
            process.exit(1);
        }
    });

program
    .command('ui')
    .description('Launch Frigg Management UI with automatic repository detection')
    .option('-p, --port <port>', 'port to run the UI server on', '3001')
    .option('--no-open', 'don\'t automatically open browser')
    .option('-r, --repo <path>', 'specify repository path (skips auto-detection)')
    .option('--dev', 'force development mode (both frontend and backend servers)')
    .addHelpText('after', `
Examples:
  $ frigg ui                   # Launch UI on default port 3001
  $ frigg ui --port 3000       # Use custom port
  $ frigg ui --no-open         # Don't open browser automatically
  $ frigg ui --repo ../myapp   # Specify repository path
  $ frigg ui --dev             # Force development mode with both servers`)
    .action((...args) => {
        const { uiCommand } = require('./ui-command');
        return uiCommand(...args);
    });

program
    .command('repos [action]')
    .description('Manage and discover Frigg repositories (actions: list, current, validate)')
    .option('--json', 'output in JSON format')
    .option('--path <path>', 'repository path (required for validate action)')
    .option('--max-depth <depth>', 'maximum search depth', '3')
    .addHelpText('after', `
Examples:
  $ frigg repos list           # List all Frigg repositories
  $ frigg repos current        # Show current repository info
  $ frigg repos validate --path /path/to/repo  # Validate a repository
  $ frigg repos list --json    # Output in JSON format`)
    .action((...args) => {
        const { reposCommand } = require('./repos-command');
        return reposCommand(...args);
    });

program
    .command('playground')
    .description('🎮 Interactive falcon animations playground')
    .option('-a, --animation <name>', 'play specific animation')
    .option('-t, --theme <theme>', 'color theme (default, fire, ice, nature, royal, golden, rainbow, matrix, neon)')
    .option('-l, --list', 'list all available animations and themes')
    .addHelpText('after', `
Examples:
  $ frigg playground           # Interactive mode
  $ frigg playground --list    # Show all animations/themes
  $ frigg playground --animation flying --theme rainbow
  $ frigg playground -a dancing -t fire`)
    .action((...args) => {
        const { playgroundCommand } = require('./playground-command');
        return playgroundCommand(...args);
    });

// Add custom help command that supports interactive mode
program
    .command('help', { isDefault: false })
    .description('Display help information')
    .option('-v, --verbose', 'Show detailed help with examples')
    .option('-i, --interactive', 'Interactive mode with arrow navigation')
    .allowUnknownOption(false)
    .action(async (options) => {
        if (options.interactive) {
            // Check if we're in a TTY environment
            if (!process.stdin.isTTY) {
                console.log(chalk.yellow('\n⚠️  Interactive mode requires a TTY terminal.'));
                console.log(chalk.gray('   Try running this command directly in your terminal.\n'));
                console.log(chalk.gray('   Falling back to standard help...\n'));
                displayHeader();
                displayQuickHelp();
            } else {
                await showInteractiveHelp();
            }
        } else if (options.verbose) {
            displayFullHelp();
        } else {
            displayHeader();
            displayQuickHelp();
        }
        process.exit(0);
    });

// Custom help handling
program
    .name('frigg')
    .version(require('../package.json').version)
    .description('Frigg CLI - The Integration Framework for Modern Applications')
    .configureHelp({
        sortSubcommands: true,
        subcommandTerm: (cmd) => cmd.name(),
        // Disable default help formatting
        formatHelp: () => {
            // Only show custom help for main --help flag
            const forceAscii = process.env.FRIGG_ASCII_ONLY === 'true';
            displayHeader(false, forceAscii);
            displayQuickHelp();
            console.log('\n' + chalk.gray('Use "frigg help -v" for detailed help or "frigg help -i" for interactive mode'));
            return '';
        }
    })
    .helpOption('-h, --help', 'Display help')
    .addHelpCommand(false) // Disable built-in help command
    .showHelpAfterError('(add --help for additional information)');

// Handle no command
if (!process.argv.slice(2).length) {
    displayHeader(false, process.env.FRIGG_ASCII_ONLY === 'true');
    displayQuickHelp();
    console.log('\n' + chalk.gray('Use --help for more information'));
    process.exit(0);
}

program.parse(process.argv);

// Export nothing - this is a CLI entry point
