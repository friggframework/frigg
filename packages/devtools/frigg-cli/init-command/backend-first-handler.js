const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { execSync } = require('child_process');
const spawn = require('cross-spawn');
const npmRegistry = require('../utils/npm-registry');
const {
    validateAppDefinition,
    formatErrors,
} = require('@friggframework/schemas');
const {
    getScaffoldDependencies,
    getScaffoldScripts,
} = require('./scaffold-dependencies');

const {
    DEPLOYMENT_MODES,
    DEFAULT_DEPLOYMENT_MODE,
} = require('./deployment-modes');

/** Sub-directory that holds the Frigg backend in embedded mode. */
const EMBEDDED_DIR = 'frigg-integration';

/**
 * Template files stored under a different name. npm strips `.gitignore` from
 * published packages, and dotfiles are easy to lose, so they are renamed when
 * copied into the new project.
 */
const RENAMED_TEMPLATE_FILES = {
    gitignore: '.gitignore',
    'env.example': '.env.example',
};

/**
 * Files that may already exist in the target directory. They are kept (not
 * overwritten) unless --force is given.
 */
const PRESERVED_FILES = ['README.md', '.gitignore'];
const ALLOWED_EXISTING_FILES = ['.git', '.DS_Store', ...PRESERVED_FILES];

const TEMPLATE_APP_NAME = "name: 'frigg-app',";
const TEMPLATE_README_TITLE = '# Frigg Backend';

/**
 * Scaffolds a new Frigg backend application.
 *
 * Prompts are interactive only when stdin is a TTY and --yes was not given;
 * otherwise every prompt resolves to its default, so `frigg init` works in CI
 * and scripts.
 */
class BackendFirstHandler {
    constructor(targetPath, options = {}) {
        this.targetPath = targetPath;
        this.appName = path.basename(targetPath);
        this.options = options;
        this.templatesDir = path.join(__dirname, '..', 'templates');
        this.interactive =
            options.interactive !== undefined
                ? Boolean(options.interactive)
                : !options.yes && Boolean(process.stdin.isTTY);
        // Test seam: inject prompt implementations.
        this.prompts = options.prompts || null;
    }

    /**
     * Ask a question, or return its default when running non-interactively.
     *
     * @param {'select'|'confirm'|'checkbox'} type - @inquirer/prompts function.
     * @param {object} config - Prompt config; `default` is used when
     *   non-interactive.
     */
    async ask(type, config) {
        if (!this.interactive) {
            return config.default;
        }
        // eslint-disable-next-line global-require
        const prompts = this.prompts || require('@inquirer/prompts');
        return prompts[type](config);
    }

    /**
     * Initialize a new Frigg application
     */
    async initialize() {
        console.log(chalk.blue('🚀 Welcome to Frigg - Integration Framework'));
        console.log(
            chalk.gray('Creating a new Frigg backend application...\n')
        );

        const deploymentMode = await this.selectDeploymentMode();
        this.projectDir =
            deploymentMode === 'embedded'
                ? path.join(this.targetPath, EMBEDDED_DIR)
                : this.targetPath;

        // Fail fast, before asking anything else, if the target is not empty.
        await this.ensureSafeDirectory(this.projectDir);

        const config = await this.getProjectConfiguration(deploymentMode);

        await this.createProject(deploymentMode, config);

        console.log(
            chalk.green('\n✅ Frigg application created successfully!')
        );

        this.displayNextSteps(deploymentMode, config);
    }

    /**
     * Select deployment mode
     */
    async selectDeploymentMode() {
        if (this.options.mode) {
            if (!DEPLOYMENT_MODES.includes(this.options.mode)) {
                throw new Error(
                    `Invalid --mode "${
                        this.options.mode
                    }". Expected one of: ${DEPLOYMENT_MODES.join(', ')}`
                );
            }
            return this.options.mode;
        }

        return this.ask('select', {
            message: 'How will you deploy this Frigg application?',
            choices: [
                {
                    name: 'Standalone - Deploy as separate service',
                    value: 'standalone',
                    description: 'Run Frigg as an independent microservice',
                },
                {
                    name: 'Embedded - Add to an existing repository',
                    value: 'embedded',
                    description: `Scaffold the Frigg backend into ./${EMBEDDED_DIR} of an existing project`,
                },
            ],
            default: DEFAULT_DEPLOYMENT_MODE,
        });
    }

    /**
     * Get project configuration based on deployment mode
     */
    async getProjectConfiguration(deploymentMode) {
        const config = { deploymentMode };

        config.appPurpose = await this.ask('select', {
            message: 'What are you building with Frigg?',
            choices: [
                {
                    name: 'Integrations for my own application',
                    value: 'own-app',
                    description:
                        'Build integrations that connect your app with third-party services',
                },
                {
                    name: 'Integration platform for multiple apps',
                    value: 'platform',
                    description:
                        'Build a platform that provides integrations to other applications',
                },
                {
                    name: 'Just exploring Frigg',
                    value: 'exploring',
                    description:
                        'Testing and learning about Frigg capabilities',
                },
            ],
            default: 'own-app',
        });

        if (config.appPurpose === 'own-app') {
            config.needsCustomApiModule = await this.ask('confirm', {
                message:
                    'Do you need to create an API module for your own application?',
                default: false,
            });
        }

        // Selected modules are installed afterwards with `frigg install`,
        // which installs the package and scaffolds the integration file.
        config.includeIntegrations = await this.ask('confirm', {
            message:
                'Would you like to pick API modules to integrate with? (installed afterwards with `frigg install`)',
            default: false,
        });

        if (config.includeIntegrations) {
            config.starterIntegrations = await this.selectIntegrations();
        }

        if (deploymentMode === 'standalone') {
            config.serverlessProvider = await this.ask('select', {
                message: 'Which cloud provider will you use?',
                choices: [
                    { name: 'AWS Lambda', value: 'aws' },
                    { name: 'Local Development Only', value: 'local' },
                ],
                default: 'aws',
            });
        }

        config.installDependencies =
            this.options.install === false
                ? false
                : await this.ask('confirm', {
                      message: 'Install dependencies now?',
                      default: true,
                  });

        // Embedded mode lives inside an existing repository.
        config.initializeGit =
            deploymentMode === 'embedded' || this.options.git === false
                ? false
                : await this.ask('confirm', {
                      message: 'Initialize Git repository?',
                      default: true,
                  });

        return config;
    }

    /**
     * Let the user pick API modules. Only names are collected; the next-steps
     * output tells the user to run `frigg install <name>` for each.
     */
    async selectIntegrations() {
        console.log(
            chalk.gray('\n🔍 Discovering available API modules from npm...')
        );

        const groupedModules = await this.getModulesByType();
        const choices = [];
        // eslint-disable-next-line global-require
        const { Separator } = this.prompts || require('@inquirer/prompts');

        Object.entries(groupedModules).forEach(([category, modules]) => {
            if (modules.length === 0) return;
            choices.push(new Separator(`--- ${category} ---`));
            modules.forEach((mod) => {
                choices.push({
                    name: `${mod.integrationName} - ${
                        mod.description || 'No description'
                    }`,
                    value: mod.name.replace('@friggframework/api-module-', ''),
                    short: mod.integrationName,
                });
            });
        });

        if (choices.length === 0) {
            console.log(
                chalk.yellow(
                    '⚠️  Could not fetch modules from npm. Use `frigg search` / `frigg install <module>` later.'
                )
            );
            return [];
        }

        return this.ask('checkbox', {
            message:
                'Select API modules to integrate (space to select, enter to confirm):',
            choices,
            default: [],
        });
    }

    async getModulesByType() {
        try {
            return await npmRegistry.getModulesByType();
        } catch (error) {
            if (this.options.verbose) {
                console.error('Failed to fetch modules:', error.message);
            }
            return {};
        }
    }

    /**
     * Create the project structure
     */
    async createProject(deploymentMode, config) {
        console.log(chalk.blue('\n📁 Creating Frigg backend application...'));

        const packageName =
            deploymentMode === 'embedded'
                ? `${this.appName}-frigg-integration`
                : this.appName;

        await fs.ensureDir(this.projectDir);
        await this.copyTemplate(this.projectDir, packageName);
        await this.writePackageJson(this.projectDir, packageName);
        await this.validateGeneratedAppDefinition(
            path.join(this.projectDir, 'index.js')
        );

        if (config.initializeGit) {
            await this.initializeGit();
        }

        if (config.installDependencies) {
            config.dependenciesInstalled = await this.installDependencies();
        }
    }

    /**
     * Copy the backend template into `dir`, substituting the project name and
     * never overwriting a pre-existing README.md/.gitignore without --force.
     */
    async copyTemplate(dir, packageName) {
        const templateDir = path.join(this.templatesDir, 'backend');
        const entries = await fs.readdir(templateDir);

        for (const entry of entries) {
            const destName = RENAMED_TEMPLATE_FILES[entry] || entry;
            const dest = path.join(dir, destName);

            if (
                PRESERVED_FILES.includes(destName) &&
                !this.options.force &&
                (await fs.pathExists(dest))
            ) {
                console.log(
                    chalk.gray(
                        `Keeping existing ${destName} (use --force to overwrite)`
                    )
                );
                continue;
            }

            await fs.copy(path.join(templateDir, entry), dest);
        }

        await this.substituteInFile(
            path.join(dir, 'index.js'),
            TEMPLATE_APP_NAME,
            `name: '${packageName}',`
        );
        await this.substituteInFile(
            path.join(dir, 'README.md'),
            TEMPLATE_README_TITLE,
            `# ${packageName}`
        );

        // Seed a local .env from the example so `frigg start` has a
        // DATABASE_URL to work with. .env is git-ignored.
        const envExample = path.join(dir, '.env.example');
        const env = path.join(dir, '.env');
        if ((await fs.pathExists(envExample)) && !(await fs.pathExists(env))) {
            await fs.copy(envExample, env);
        }
    }

    async substituteInFile(filePath, search, replacement) {
        if (!(await fs.pathExists(filePath))) return;
        const content = await fs.readFile(filePath, 'utf8');
        if (!content.includes(search)) return;
        await fs.writeFile(filePath, content.replace(search, replacement));
    }

    /**
     * Write package.json with the `frigg` scripts and the dependencies the
     * composed serverless configuration needs.
     */
    async writePackageJson(dir, packageName) {
        const { dependencies, devDependencies } = getScaffoldDependencies();
        const packageJson = {
            name: packageName,
            version: '0.1.0',
            private: true,
            main: 'index.js',
            scripts: getScaffoldScripts(),
            dependencies,
            devDependencies,
        };

        await fs.writeJSON(path.join(dir, 'package.json'), packageJson, {
            spaces: 2,
        });
    }

    /**
     * Ensure the directory the backend is written to is missing or empty
     * (apart from a few harmless files), unless --force is given.
     */
    async ensureSafeDirectory(dir = this.targetPath) {
        if (!(await fs.pathExists(dir))) {
            return;
        }

        const files = await fs.readdir(dir);
        const conflictingFiles = files.filter(
            (f) => !ALLOWED_EXISTING_FILES.includes(f)
        );

        if (conflictingFiles.length > 0 && !this.options.force) {
            console.log(chalk.red(`\n❌ Directory is not empty: ${dir}`));
            console.log(
                chalk.yellow('Found files:'),
                conflictingFiles.join(', ')
            );
            console.log(chalk.gray('Use --force to override\n'));
            throw new Error('Directory not empty');
        }
    }

    /**
     * Initialize git repository
     */
    async initializeGit() {
        try {
            execSync('git init', { cwd: this.projectDir, stdio: 'ignore' });
            execSync('git add -A', { cwd: this.projectDir, stdio: 'ignore' });
            execSync('git commit -m "Initial commit from Frigg CLI"', {
                cwd: this.projectDir,
                stdio: 'ignore',
            });
            console.log(chalk.gray('Git repository initialized'));
        } catch (e) {
            // Git init failed, not critical
        }
    }

    /**
     * Install dependencies
     * @returns {boolean} whether the install succeeded
     */
    async installDependencies() {
        console.log(chalk.blue('\n📦 Installing dependencies...'));

        const useYarn = this.isUsingYarn();
        const command = useYarn ? 'yarn' : 'npm';
        const args = useYarn ? [] : ['install'];

        const proc = spawn.sync(command, args, {
            cwd: this.projectDir,
            stdio: 'inherit',
        });

        if (proc.status !== 0) {
            console.log(chalk.yellow('\n⚠️  Dependency installation failed'));
            console.log(
                chalk.gray(`You can install manually with: ${command} install`)
            );
            return false;
        }
        return true;
    }

    /**
     * Check if yarn is being used
     */
    isUsingYarn() {
        return (process.env.npm_config_user_agent || '').indexOf('yarn') === 0;
    }

    /**
     * Validate the generated app definition against the app-definition
     * schema by loading the `Definition` the generated index.js exports.
     *
     * Validation problems are reported as warnings; they never abort init.
     *
     * @returns {boolean} true when the definition is valid
     */
    async validateGeneratedAppDefinition(appDefPath) {
        if (this.options.verbose) {
            console.log(
                chalk.gray('🔍 Validating app definition against schema...')
            );
        }

        let definition;
        try {
            const resolved = require.resolve(appDefPath);
            delete require.cache[resolved];
            // eslint-disable-next-line global-require
            ({ Definition: definition } = require(resolved));
        } catch (error) {
            console.log(
                chalk.yellow(
                    `⚠️  Could not load the generated app definition for validation: ${error.message}`
                )
            );
            return false;
        }

        if (!definition) {
            console.log(
                chalk.yellow(
                    `⚠️  ${path.basename(
                        appDefPath
                    )} does not export a Definition`
                )
            );
            return false;
        }

        const result = validateAppDefinition(definition);
        if (!result.valid) {
            console.log(
                chalk.yellow('⚠️  App definition has validation warnings:')
            );
            console.log(chalk.gray(formatErrors(result.errors)));
            return false;
        }

        if (this.options.verbose) {
            console.log(
                chalk.green('✅ App definition passes schema validation')
            );
        }
        return true;
    }

    /**
     * Display next steps
     */
    displayNextSteps(deploymentMode, config) {
        const relativePath = path.relative(process.cwd(), this.projectDir);
        const cdPath = relativePath || '.';
        let step = 1;
        const printStep = (text, command) => {
            console.log(`${step}. ${text}`);
            console.log(chalk.cyan(`   ${command}\n`));
            step += 1;
        };

        console.log(chalk.bold('\n📋 Next Steps:\n'));

        printStep('Navigate to your project:', `cd ${cdPath}`);

        if (!config.dependenciesInstalled) {
            printStep('Install dependencies:', 'npm install');
        }

        printStep(
            'Start PostgreSQL and check DATABASE_URL in .env:',
            'docker run --name frigg-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16'
        );
        printStep('Set up the database:', 'npm run db:setup');
        printStep('Start the development server:', 'npm start');

        const integrations = config.starterIntegrations || [];
        if (integrations.length > 0) {
            printStep(
                'Install the API modules you selected (each adds src/integrations/<Name>Integration.js and lists it in index.js):',
                integrations
                    .map((name) => `npx frigg install ${name}`)
                    .join('\n   ')
            );
        } else {
            printStep(
                'Add an integration from the API module library (adds src/integrations/<Name>Integration.js and lists it in index.js):',
                'npx frigg install <module>   # e.g. npx frigg install hubspot'
            );
        }

        if (config.serverlessProvider === 'aws') {
            printStep(
                'Deploy to AWS Lambda with a hosted PostgreSQL ($0 while idle; see README.md):',
                "DATABASE_URL='postgresql://...?sslmode=require' npm run deploy -- --stage prod"
            );
        }

        if (config.needsCustomApiModule) {
            console.log(
                chalk.gray(
                    'To build an API module for your own application, see https://docs.friggframework.org (API modules).'
                )
            );
        }

        console.log(chalk.green('\n🎉 Happy integrating with Frigg!\n'));
        console.log(
            chalk.gray('Documentation: https://docs.friggframework.org')
        );
        console.log(
            chalk.gray(
                'Support: https://github.com/friggframework/frigg/issues'
            )
        );
    }
}

module.exports = BackendFirstHandler;
module.exports.EMBEDDED_DIR = EMBEDDED_DIR;
