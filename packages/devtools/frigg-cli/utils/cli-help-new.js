const chalk = require('chalk');
const { version } = require('../../package.json');

// Simplified version of the detailed Frigg falcon ASCII art
const FALCON_ASCII = `
      /\\
     /=\\
    /=/\\\\
   /=/ \\=\\
  /=/   \\=\\
 /=/     \\=\\
<=/       \\=>
 \\=\\     /=/
  \\=\\   /=/
   \\=\\ /=/
    \\=V=/
     \\=/
`;

// Even simpler version
const FALCON_ASCII_SIMPLE = `
    /\\
   /=\\
  /=/\\\\
 /=/ \\=\\
<=|   |=>
 \\=\\ /=/
  \\=V=/
   \\=/
`;

// Compact version for inline use
const FALCON_ASCII_COMPACT = `
  /\\
 /=\\
/=/\\\\
\\=\\/=/
 \\=/
`;

function displayLogo(style = 'default') {
    const logos = {
        default: FALCON_ASCII_SIMPLE,
        detailed: FALCON_ASCII,
        compact: FALCON_ASCII_COMPACT
    };
    
    const logo = logos[style] || logos.default;
    console.log(chalk.cyan(logo));
}

function displayHeader() {
    displayLogo();
    console.log(chalk.bold.cyan('  Frigg CLI') + chalk.gray(` v${version}`));
    console.log(chalk.gray('  The Integration Framework for Modern Applications\n'));
}

function displayCommandHelp(command, description, options = [], examples = []) {
    console.log(chalk.bold.white(`\n${command}`));
    console.log(chalk.gray(`  ${description}`));
    
    if (options.length > 0) {
        console.log(chalk.dim('\n  Options:'));
        options.forEach(opt => {
            const [flag, desc] = opt;
            console.log(`    ${chalk.cyan(flag.padEnd(25))} ${chalk.gray(desc)}`);
        });
    }
    
    if (examples.length > 0) {
        console.log(chalk.dim('\n  Examples:'));
        examples.forEach(example => {
            console.log(`    ${chalk.green('$')} ${chalk.white(example)}`);
        });
    }
}

function displayFullHelp() {
    displayHeader();
    
    console.log(chalk.bold('Commands:\n'));
    
    // Init command
    displayCommandHelp(
        'init <project-name>',
        'Create a new Frigg application',
        [
            ['-m, --mode <mode>', 'Deployment mode: embedded or standalone'],
            ['--no-frontend', 'Skip demo frontend'],
            ['--frontend', 'Include demo frontend'],
            ['--force', 'Overwrite existing files']
        ],
        [
            'frigg init my-app',
            'frigg init my-app --mode standalone',
            'frigg init my-app --frontend'
        ]
    );
    
    // Install command
    displayCommandHelp(
        'install [apiModuleName]',
        'Install an API module',
        [],
        [
            'frigg install',
            'frigg install slack',
            'frigg install github'
        ]
    );
    
    // UI command
    displayCommandHelp(
        'ui',
        'Launch Frigg Management UI',
        [
            ['-p, --port <port>', 'Port to run the UI server (default: 3001)'],
            ['--no-open', "Don't automatically open browser"],
            ['-r, --repo <path>', 'Specify repository path']
        ],
        [
            'frigg ui',
            'frigg ui --port 3000',
            'frigg ui --repo /path/to/project'
        ]
    );
    
    // Generate command
    displayCommandHelp(
        'generate <type> <name>',
        'Generate Frigg components',
        [
            ['-p, --path <path>', 'Output directory path'],
            ['--from-spec <url>', 'Generate from OpenAPI spec'],
            ['--auth <type>', 'Auth type: oauth2, apiKey, basic, custom']
        ],
        [
            'frigg generate api-module shopify',
            'frigg generate api-module stripe --auth oauth2',
            'frigg generate api-module custom --from-spec https://api.example.com/openapi.json'
        ]
    );
    
    // Repos command
    displayCommandHelp(
        'repos [action]',
        'Manage Frigg repositories',
        [
            ['list', 'List all Frigg repositories'],
            ['current', 'Show current repository info'],
            ['validate', 'Validate a repository'],
            ['--json', 'Output in JSON format'],
            ['--path <path>', 'Repository path (for validate)']
        ],
        [
            'frigg repos list',
            'frigg repos current',
            'frigg repos validate --path /path/to/repo'
        ]
    );
    
    // Deploy commands
    displayCommandHelp(
        'start',
        'Run the application locally',
        [
            ['-s, --stage <stage>', 'Deployment stage (default: dev)'],
            ['-v, --verbose', 'Enable verbose output']
        ],
        ['frigg start', 'frigg start --stage production']
    );
    
    displayCommandHelp(
        'deploy',
        'Deploy to serverless infrastructure',
        [
            ['-s, --stage <stage>', 'Deployment stage (default: dev)'],
            ['-v, --verbose', 'Enable verbose output']
        ],
        ['frigg deploy', 'frigg deploy --stage production']
    );
    
    // Playground command
    displayCommandHelp(
        'playground',
        '🎮 Interactive falcon animations',
        [
            ['-a, --animation <name>', 'Play specific animation'],
            ['-t, --theme <theme>', 'Color theme'],
            ['-l, --list', 'List all animations/themes']
        ],
        [
            'frigg playground',
            'frigg playground --list',
            'frigg playground -a flying -t rainbow'
        ]
    );
    
    console.log(chalk.bold('\nGetting Started:\n'));
    console.log('  1. Create a new project:    ' + chalk.cyan('frigg init my-app'));
    console.log('  2. Launch the UI:           ' + chalk.cyan('frigg ui'));
    console.log('  3. Install integrations:    ' + chalk.cyan('frigg install slack'));
    console.log('  4. Start development:       ' + chalk.cyan('frigg start'));
    
    console.log(chalk.bold('\nLearn More:\n'));
    console.log('  Documentation:  ' + chalk.cyan('https://docs.frigg.ai'));
    console.log('  GitHub:         ' + chalk.cyan('https://github.com/friggframework/frigg'));
    console.log('  Discord:        ' + chalk.cyan('https://discord.gg/frigg'));
    
    console.log();
}

function displayCommandNotFound(command) {
    displayLogo();
    console.log(chalk.red(`\n  Command "${command}" not found.\n`));
    console.log(chalk.gray('  Run ') + chalk.cyan('frigg --help') + chalk.gray(' to see available commands.\n'));
}

function displayQuickHelp() {
    console.log(chalk.bold('\nUsage:') + ' frigg <command> [options]\n');
    console.log(chalk.bold('Commands:'));
    console.log('  ' + chalk.cyan('init') + '       Create a new Frigg application');
    console.log('  ' + chalk.cyan('ui') + '         Launch Frigg Management UI');
    console.log('  ' + chalk.cyan('install') + '    Install API modules');
    console.log('  ' + chalk.cyan('generate') + '   Generate components');
    console.log('  ' + chalk.cyan('repos') + '      Manage repositories');
    console.log('  ' + chalk.cyan('start') + '      Run locally');
    console.log('  ' + chalk.cyan('deploy') + '     Deploy to cloud');
    console.log('  ' + chalk.cyan('playground') + ' 🎮 Falcon animations');
    console.log('  ' + chalk.cyan('help') + '       Show help information');
    console.log('\nRun ' + chalk.cyan('frigg <command> --help') + ' for detailed command info');
}

module.exports = {
    displayLogo,
    displayHeader,
    displayCommandHelp,
    displayFullHelp,
    displayCommandNotFound,
    displayQuickHelp
};