const path = require('path');
const fs = require('fs');
const { ValidateAppUseCase } = require('../../application/use-cases/validate-app-use-case');
const { AppDefinitionValidator } = require('../../infrastructure/validators/app-definition-validator');
const { IntegrationClassValidator } = require('../../infrastructure/validators/integration-class-validator');
const { ApiModuleValidator } = require('../../infrastructure/validators/api-module-validator');

function createValidateCommand(program) {
    program
        .command('validate [path]')
        .description('Validate a Frigg application configuration (auto-detects local app if no path given)')
        .option('-f, --format <format>', 'Output format (console, json)', 'console')
        .option('-v, --verbose', 'Show detailed output including fix suggestions', false)
        .action(async (appPath, options) => {
            const output = require('../../../utils/output');
            await validateCommand(appPath, options, { output });
        });
}

function autoDetectFriggApp(startDir = process.cwd()) {
    let currentDir = startDir;
    const root = path.parse(currentDir).root;

    while (currentDir !== root) {
        const backendPath = findBackendPathInDir(currentDir);
        if (backendPath) {
            return { appRoot: currentDir, backendPath };
        }
        currentDir = path.dirname(currentDir);
    }

    return null;
}

function findBackendPathInDir(dir) {
    const backendDir = path.join(dir, 'backend');
    if (fs.existsSync(path.join(backendDir, 'index.js'))) {
        return backendDir;
    }

    if (fs.existsSync(path.join(dir, 'index.js'))) {
        const content = fs.readFileSync(path.join(dir, 'index.js'), 'utf-8');
        if (content.includes('integrations') || content.includes('Definition')) {
            return dir;
        }
    }

    return null;
}

function findBackendPath(startPath) {
    const absolutePath = path.isAbsolute(startPath) ? startPath : path.resolve(process.cwd(), startPath);

    const backendDir = path.join(absolutePath, 'backend');
    if (fs.existsSync(path.join(backendDir, 'package.json')) || fs.existsSync(path.join(backendDir, 'index.js'))) {
        return backendDir;
    }

    if (fs.existsSync(path.join(absolutePath, 'package.json')) || fs.existsSync(path.join(absolutePath, 'index.js'))) {
        return absolutePath;
    }

    return null;
}

function loadAppDefinition(backendPath) {
    const indexPath = path.join(backendPath, 'index.js');
    if (!fs.existsSync(indexPath)) {
        throw new Error(`No index.js found at ${backendPath}`);
    }

    const originalCwd = process.cwd();
    try {
        process.chdir(backendPath);
        delete require.cache[require.resolve(indexPath)];
        const exported = require(indexPath);
        return exported.Definition || exported.default || exported;
    } finally {
        process.chdir(originalCwd);
    }
}

async function validateCommand(appPath, options, { output }) {
    try {
        let backendPath;
        let definition;

        if (!appPath) {
            const detected = autoDetectFriggApp();
            if (!detected) {
                output.error('No Frigg app found. Run from within a Frigg app directory or specify a path.');
                return;
            }
            backendPath = detected.backendPath;
            output.info(`Auto-detected Frigg app at: ${detected.appRoot}`);
        } else {
            backendPath = findBackendPath(appPath);
            if (!backendPath) {
                output.error(`Could not find backend directory in ${appPath}`);
                return;
            }
            output.info(`Validating Frigg app at: ${appPath}`);
        }

        try {
            definition = loadAppDefinition(backendPath);
        } catch (err) {
            output.error(`Could not load app definition: ${err.message}`);
            return;
        }

        const appDefinitionValidator = new AppDefinitionValidator();
        const integrationClassValidator = new IntegrationClassValidator();
        const apiModuleValidator = new ApiModuleValidator();
        const useCase = new ValidateAppUseCase({
            appDefinitionValidator,
            integrationClassValidator,
            apiModuleValidator
        });

        const result = await useCase.execute({ definition, appPath: backendPath });

        if (options.format === 'json') {
            output.log(JSON.stringify(result.toJSON(), null, 2));
            return;
        }

        formatConsoleOutput(result, options, output);
    } catch (err) {
        output.error(`Validation failed: ${err.message}`);
        if (options.verbose) {
            output.error(err.stack);
        }
    }
}

function formatConsoleOutput(result, options, output) {
    const summary = result.getSummary();

    output.log('');
    output.log('═'.repeat(60));
    output.log('  FRIGG VALIDATE - App Configuration Report');
    output.log('═'.repeat(60));
    output.log('');

    if (result.isValid()) {
        output.success('App configuration is valid');
    } else {
        output.error(`App configuration has ${summary.errorCount} error(s)`);
    }

    if (summary.warningCount > 0) {
        output.warn(`${summary.warningCount} warning(s) found`);
    }

    output.log('');

    if (result.getErrors().length > 0) {
        output.log('─'.repeat(60));
        output.log('ERRORS:');
        output.log('');
        result.getErrors().forEach((error, idx) => {
            output.log(`  ${idx + 1}. [${error.path}] ${error.message}`);
            if (options.verbose && error.fix) {
                output.log(`     Fix: ${error.fix.description}`);
                if (error.fix.template) {
                    output.log(`     Template: ${JSON.stringify(error.fix.template)}`);
                }
            }
        });
        output.log('');
    }

    if (result.getWarnings().length > 0) {
        output.log('─'.repeat(60));
        output.log('WARNINGS:');
        output.log('');
        result.getWarnings().forEach((warning, idx) => {
            output.log(`  ${idx + 1}. [${warning.path}] ${warning.message}`);
            if (options.verbose && warning.fix) {
                output.log(`     Fix: ${warning.fix.description}`);
            }
        });
        output.log('');
    }

    output.log('═'.repeat(60));
    output.log('');
}

module.exports = {
    validateCommand,
    createValidateCommand,
    formatConsoleOutput,
    autoDetectFriggApp,
    findBackendPathInDir,
    findBackendPath,
    loadAppDefinition
};
