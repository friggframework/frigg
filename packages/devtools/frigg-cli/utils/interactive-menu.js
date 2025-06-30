const chalk = require('chalk');
const readline = require('readline');
const { spawn } = require('child_process');
const { displayLogo } = require('./cli-help');

const COMMANDS = [
    {
        name: 'init',
        description: 'Create a new Frigg application',
        examples: [
            'frigg init my-app',
            'frigg init my-app --mode standalone',
            'frigg init my-app --frontend'
        ],
        details: 'Initialize a new Frigg project with backend and optional frontend.'
    },
    {
        name: 'ui',
        description: 'Launch Frigg Management UI',
        examples: [
            'frigg ui',
            'frigg ui --port 3000',
            'frigg ui --no-open'
        ],
        details: 'Start the management UI to configure integrations, test APIs, and monitor your app.'
    },
    {
        name: 'install',
        description: 'Install API modules',
        examples: [
            'frigg install',
            'frigg install slack',
            'frigg install github'
        ],
        details: 'Add pre-built integrations to your Frigg application.'
    },
    {
        name: 'generate',
        description: 'Generate components',
        examples: [
            'frigg generate api-module shopify',
            'frigg generate api-module stripe --auth oauth2'
        ],
        details: 'Generate new API modules from templates or OpenAPI specifications.'
    },
    {
        name: 'repos',
        description: 'Manage repositories',
        examples: [
            'frigg repos list',
            'frigg repos current',
            'frigg repos validate --path /path/to/repo'
        ],
        details: 'Discover and manage Frigg repositories on your system.'
    },
    {
        name: 'start',
        description: 'Run locally',
        examples: [
            'frigg start',
            'frigg start --stage production'
        ],
        details: 'Start your application in development mode with hot reload.'
    },
    {
        name: 'deploy',
        description: 'Deploy to cloud',
        examples: [
            'frigg deploy',
            'frigg deploy --stage production'
        ],
        details: 'Deploy your application to AWS using serverless architecture.'
    },
    {
        name: 'playground',
        description: '🎮 Falcon animations',
        examples: [
            'frigg playground',
            'frigg playground --list',
            'frigg playground -a flying -t rainbow'
        ],
        details: 'Interactive playground with animated falcon mascot!'
    }
];

class InteractiveMenu {
    constructor() {
        this.selectedIndex = 0;
        this.rl = null;
    }

    async show() {
        // Show a message before clearing
        console.log(chalk.cyan('\nLaunching interactive mode...'));
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.clear();
        displayLogo();
        console.log(chalk.bold.cyan('  Frigg CLI - Interactive Mode\n'));
        console.log(chalk.gray('  Use ↑/↓ arrows to navigate, Enter to select, ESC to exit\n'));

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }

        this.render();

        return new Promise((resolve) => {
            process.stdin.on('keypress', async (str, key) => {
                if (key && key.name === 'escape') {
                    this.cleanup();
                    resolve(null);
                    return;
                }

                if (key && key.name === 'up') {
                    this.selectedIndex = (this.selectedIndex - 1 + COMMANDS.length) % COMMANDS.length;
                    this.render();
                }

                if (key && key.name === 'down') {
                    this.selectedIndex = (this.selectedIndex + 1) % COMMANDS.length;
                    this.render();
                }

                if (key && key.name === 'return') {
                    const selected = COMMANDS[this.selectedIndex];
                    this.cleanup();
                    const action = await this.showCommandOptions(selected);
                    resolve({ command: selected, action });
                }
            });
        });
    }

    render() {
        // Move cursor to start of command list
        process.stdout.write('\x1B[7;0H');
        process.stdout.write('\x1B[J'); // Clear from cursor down

        COMMANDS.forEach((cmd, index) => {
            const isSelected = index === this.selectedIndex;
            const prefix = isSelected ? chalk.cyan('▶ ') : '  ';
            const name = isSelected ? chalk.bold.cyan(cmd.name.padEnd(12)) : chalk.white(cmd.name.padEnd(12));
            const desc = isSelected ? chalk.white(cmd.description) : chalk.gray(cmd.description);
            
            console.log(`${prefix}${name} ${desc}`);
        });

        // Show details for selected command
        console.log('\n' + chalk.gray('─'.repeat(60)));
        const selected = COMMANDS[this.selectedIndex];
        console.log(chalk.bold('\n' + selected.name));
        console.log(chalk.gray(selected.details));
        console.log(chalk.dim('\nExamples:'));
        selected.examples.forEach(ex => {
            console.log(chalk.green('  $ ') + chalk.white(ex));
        });
    }

    async showCommandOptions(command) {
        console.clear();
        displayLogo();
        console.log(chalk.bold.cyan(`\n  Command: ${command.name}\n`));
        console.log(chalk.gray(`  ${command.details}\n`));

        const options = [
            { key: 'i', label: 'Show more info', action: 'info' },
            { key: 'r', label: 'Run this command', action: 'run' },
            { key: 'e', label: 'Run with options...', action: 'run-with-options' },
            { key: 'b', label: 'Back to menu', action: 'back' },
            { key: 'q', label: 'Quit', action: 'quit' }
        ];

        options.forEach(opt => {
            console.log(`  ${chalk.cyan(opt.key)} - ${opt.label}`);
        });

        console.log(chalk.gray('\n  Press a key to continue...'));

        return new Promise((resolve) => {
            const handleKeypress = (str, key) => {
                process.stdin.removeListener('keypress', handleKeypress);
                
                const option = options.find(opt => opt.key === str);
                if (option) {
                    resolve(option.action);
                } else if (key && key.name === 'escape') {
                    resolve('back');
                } else {
                    // Invalid key, show options again
                    this.showCommandOptions(command).then(resolve);
                }
            };

            process.stdin.on('keypress', handleKeypress);
        });
    }

    cleanup() {
        if (this.rl) {
            this.rl.close();
        }
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
        }
        process.stdin.removeAllListeners('keypress');
    }
}

async function showInteractiveHelp() {
    try {
        const menu = new InteractiveMenu();
        
        while (true) {
            const result = await menu.show();
            
            if (!result) {
                console.clear();
                console.log(chalk.gray('\nExiting interactive mode...\n'));
                break;
            }

            const { command, action } = result;

            switch (action) {
                case 'info':
                    await showDetailedInfo(command);
                    break;
                case 'run':
                    await runCommand(command.name);
                    return;
                case 'run-with-options':
                    await runCommandWithOptions(command);
                    return;
                case 'quit':
                    console.clear();
                    console.log(chalk.gray('\nGoodbye! 👋\n'));
                    process.exit(0);
                case 'back':
                    // Continue loop
                    break;
            }
        }
    } catch (error) {
        console.error(chalk.red('\nError in interactive mode:'), error.message);
        if (error.stack) {
            console.error(chalk.gray(error.stack));
        }
        process.exit(1);
    }
}

async function showDetailedInfo(command) {
    console.clear();
    console.log(chalk.bold.cyan(`\n  ${command.name} - Detailed Information\n`));
    console.log(chalk.white(`  ${command.details}\n`));
    
    console.log(chalk.bold('  Examples:'));
    command.examples.forEach(ex => {
        console.log(chalk.green('    $ ') + chalk.white(ex));
    });
    
    console.log(chalk.gray('\n  Press any key to return to menu...'));
    
    return new Promise((resolve) => {
        process.stdin.once('keypress', () => {
            resolve();
        });
    });
}

async function runCommand(commandName, args = []) {
    console.clear();
    console.log(chalk.cyan(`\nRunning: frigg ${commandName} ${args.join(' ')}\n`));
    
    const child = spawn('node', [__dirname + '/../index.js', commandName, ...args], {
        stdio: 'inherit',
        shell: true
    });

    child.on('exit', (code) => {
        if (code !== 0) {
            console.log(chalk.red(`\nCommand exited with code ${code}`));
        }
        process.exit(code || 0);
    });
}

async function runCommandWithOptions(command) {
    console.clear();
    console.log(chalk.bold.cyan(`\n  Run ${command.name} with options\n`));
    console.log(chalk.gray('  Enter additional arguments (or press Enter for none):\n'));
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(chalk.green('  $ frigg ' + command.name + ' '), (answer) => {
            rl.close();
            const args = answer.trim().split(/\s+/).filter(Boolean);
            runCommand(command.name, args);
            resolve();
        });
    });
}

module.exports = {
    showInteractiveHelp,
    InteractiveMenu
};