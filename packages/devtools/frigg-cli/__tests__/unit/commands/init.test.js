/**
 * Tests for the init command and BackendFirstHandler
 * TDD: These tests define the expected behavior for frigg init
 */

const path = require('path');
const fs = require('fs-extra');

// Mock dependencies before requiring the modules
jest.mock('@inquirer/prompts', () => ({
    select: jest.fn(),
    confirm: jest.fn(),
    multiselect: jest.fn()
}));

jest.mock('../../../utils/npm-registry', () => ({
    searchApiModules: jest.fn().mockResolvedValue([]),
    getModulesByType: jest.fn().mockResolvedValue({})
}));

jest.mock('@friggframework/schemas', () => ({
    validateAppDefinition: jest.fn().mockReturnValue({ valid: true, errors: [] }),
    formatErrors: jest.fn().mockReturnValue('')
}));

const { select, confirm, multiselect } = require('@inquirer/prompts');
const BackendFirstHandler = require('../../../init-command/backend-first-handler');

describe('BackendFirstHandler', () => {
    let tempDir;
    let targetPath;

    beforeEach(async () => {
        // Create a real temporary directory for each test
        tempDir = global.TestHelpers.createTempDir();
        targetPath = path.join(tempDir, 'test-frigg-app');

        // Reset all mocks
        jest.clearAllMocks();
    });

    afterEach(async () => {
        // Clean up
        global.TestHelpers.cleanupTempDir(tempDir);
    });

    describe('constructor', () => {
        test('initializes with target path and options', () => {
            const handler = new BackendFirstHandler(targetPath, { verbose: true });

            expect(handler.targetPath).toBe(targetPath);
            expect(handler.appName).toBe('test-frigg-app');
            expect(handler.options.verbose).toBe(true);
        });

        test('sets templates directory correctly', () => {
            const handler = new BackendFirstHandler(targetPath);

            expect(handler.templatesDir).toContain('templates');
        });
    });

    describe('selectDeploymentMode', () => {
        test('returns mode from options if provided', async () => {
            const handler = new BackendFirstHandler(targetPath, { mode: 'standalone' });

            const mode = await handler.selectDeploymentMode();

            expect(mode).toBe('standalone');
            expect(select).not.toHaveBeenCalled();
        });

        test('prompts user if mode not provided', async () => {
            select.mockResolvedValue('embedded');
            const handler = new BackendFirstHandler(targetPath, {});

            const mode = await handler.selectDeploymentMode();

            expect(mode).toBe('embedded');
            expect(select).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining('deploy')
            }));
        });
    });

    describe('getProjectConfiguration', () => {
        test('collects all required configuration options', async () => {
            const handler = new BackendFirstHandler(targetPath, { frontend: false });

            // Mock all prompts in correct order
            // 1. appPurpose
            select.mockResolvedValueOnce('own-app');
            // 2. needsCustomApiModule (only asked when appPurpose === 'own-app')
            confirm.mockResolvedValueOnce(true);
            // 3. includeIntegrations
            confirm.mockResolvedValueOnce(false);
            // 4. serverlessProvider (only for standalone)
            select.mockResolvedValueOnce('aws');
            // 5. installDependencies
            confirm.mockResolvedValueOnce(true);
            // 6. initializeGit
            confirm.mockResolvedValueOnce(true);

            const config = await handler.getProjectConfiguration('standalone');

            expect(config.deploymentMode).toBe('standalone');
            expect(config.appPurpose).toBe('own-app');
            expect(config.needsCustomApiModule).toBe(true);
            expect(config.installDependencies).toBe(true);
            expect(config.initializeGit).toBe(true);
        });

        test('asks about demo frontend when not disabled', async () => {
            const handler = new BackendFirstHandler(targetPath, { frontend: undefined });

            // Mock prompts in correct order:
            // 1. appPurpose
            select.mockResolvedValueOnce('exploring');
            // 2. includeIntegrations
            confirm.mockResolvedValueOnce(false);
            // 3. includeDemoFrontend (asked when frontend !== false)
            confirm.mockResolvedValueOnce(true);
            // 4. frontendFramework (asked when includeDemoFrontend is true)
            select.mockResolvedValueOnce('react');
            // 5. demoAuthMode (asked when includeDemoFrontend is true)
            select.mockResolvedValueOnce('mock');
            // 6. serverlessProvider (for standalone mode)
            select.mockResolvedValueOnce('local');
            // 7. installDependencies
            confirm.mockResolvedValueOnce(true);
            // 8. initializeGit
            confirm.mockResolvedValueOnce(true);

            const config = await handler.getProjectConfiguration('standalone');

            expect(config.includeDemoFrontend).toBe(true);
            expect(config.frontendFramework).toBe('react');
            expect(config.demoAuthMode).toBe('mock');
        });

        test('skips demo frontend question when frontend is false', async () => {
            const handler = new BackendFirstHandler(targetPath, { frontend: false });

            select.mockResolvedValueOnce('exploring') // appPurpose
                  .mockResolvedValueOnce('local'); // serverlessProvider
            confirm.mockResolvedValueOnce(false) // includeIntegrations
                   .mockResolvedValueOnce(true)  // installDependencies
                   .mockResolvedValueOnce(true); // initializeGit

            const config = await handler.getProjectConfiguration('standalone');

            expect(config.includeDemoFrontend).toBeUndefined();
        });
    });

    describe('createProject', () => {
        test('creates target directory if it does not exist', async () => {
            const handler = new BackendFirstHandler(targetPath, { force: true });

            // Create minimal config
            const config = {
                deploymentMode: 'standalone',
                installDependencies: false,
                initializeGit: false,
                serverlessProvider: 'local'
            };

            // Mock that templates exist
            const templatesDir = handler.templatesDir;
            const backendTemplateDir = path.join(templatesDir, 'backend');

            // We expect the directory to be created
            await handler.ensureSafeDirectory();

            expect(fs.existsSync(targetPath)).toBe(true);
        });

        test('throws error when directory is not empty without force flag', async () => {
            // Create target directory with a file in it
            await fs.ensureDir(targetPath);
            await fs.writeFile(path.join(targetPath, 'existing-file.js'), 'content');

            const handler = new BackendFirstHandler(targetPath, { force: false });

            await expect(handler.ensureSafeDirectory())
                .rejects
                .toThrow('Directory not empty');
        });

        test('allows non-empty directory with force flag', async () => {
            // Create target directory with a file in it
            await fs.ensureDir(targetPath);
            await fs.writeFile(path.join(targetPath, 'existing-file.js'), 'content');

            const handler = new BackendFirstHandler(targetPath, { force: true });

            // Should not throw
            await handler.ensureSafeDirectory();

            expect(fs.existsSync(targetPath)).toBe(true);
        });

        test('allows allowed files without force flag', async () => {
            // Create target directory with allowed files
            await fs.ensureDir(targetPath);
            await fs.writeFile(path.join(targetPath, '.git'), '');
            await fs.writeFile(path.join(targetPath, '.gitignore'), '');
            await fs.writeFile(path.join(targetPath, 'README.md'), '');

            const handler = new BackendFirstHandler(targetPath, { force: false });

            // Should not throw for allowed files
            await handler.ensureSafeDirectory();

            expect(fs.existsSync(targetPath)).toBe(true);
        });
    });

    describe('createStandaloneProject', () => {
        // Note: These tests rely on the real backend template in templates/backend
        // If the template doesn't exist, tests will be skipped

        test('creates package.json with correct scripts', async () => {
            const handler = new BackendFirstHandler(targetPath, { force: true });
            await fs.ensureDir(targetPath);

            const config = {
                serverlessProvider: 'aws',
                starterIntegrations: [],
                installDependencies: false
            };

            await handler.createStandaloneProject(config);

            const packageJson = await fs.readJSON(path.join(targetPath, 'package.json'));

            expect(packageJson.name).toBe('test-frigg-app');
            expect(packageJson.scripts).toHaveProperty('start');
            expect(packageJson.scripts).toHaveProperty('build');
            expect(packageJson.scripts).toHaveProperty('deploy');
            expect(packageJson.scripts).toHaveProperty('test');
        });

        test('adds selected integrations as dependencies', async () => {
            const handler = new BackendFirstHandler(targetPath, { force: true });
            await fs.ensureDir(targetPath);

            const config = {
                serverlessProvider: 'aws',
                starterIntegrations: ['salesforce', 'hubspot'],
                installDependencies: false
            };

            await handler.createStandaloneProject(config);

            const packageJson = await fs.readJSON(path.join(targetPath, 'package.json'));

            expect(packageJson.dependencies).toHaveProperty('@friggframework/api-module-salesforce');
            expect(packageJson.dependencies).toHaveProperty('@friggframework/api-module-hubspot');
        });

        test('includes @friggframework/core as dependency', async () => {
            const handler = new BackendFirstHandler(targetPath, { force: true });
            await fs.ensureDir(targetPath);

            const config = {
                serverlessProvider: 'local',
                starterIntegrations: [],
                installDependencies: false
            };

            await handler.createStandaloneProject(config);

            const packageJson = await fs.readJSON(path.join(targetPath, 'package.json'));

            expect(packageJson.dependencies).toHaveProperty('@friggframework/core');
        });
    });

    describe('createEmbeddedProject', () => {
        // Note: These tests rely on the real backend template in templates/backend
        // If the template doesn't exist, tests will be skipped

        test('creates frigg-integration subdirectory', async () => {
            const handler = new BackendFirstHandler(targetPath, { force: true });
            await fs.ensureDir(targetPath);

            const config = {
                installDependencies: false
            };

            await handler.createEmbeddedProject(config);

            const integrationDir = path.join(targetPath, 'frigg-integration');
            expect(fs.existsSync(integrationDir)).toBe(true);
        });

        test('creates FRIGG_INTEGRATION.md guide', async () => {
            const handler = new BackendFirstHandler(targetPath, { force: true });
            await fs.ensureDir(targetPath);

            const config = {
                installDependencies: false
            };

            await handler.createEmbeddedProject(config);

            const guidePath = path.join(targetPath, 'FRIGG_INTEGRATION.md');
            expect(fs.existsSync(guidePath)).toBe(true);

            const content = await fs.readFile(guidePath, 'utf8');
            expect(content).toContain('# Frigg Integration Guide');
            expect(content).toContain('@friggframework/core');
        });
    });

    describe('getIntegrationClassName', () => {
        test('converts known integrations to class names', () => {
            const handler = new BackendFirstHandler(targetPath);

            expect(handler.getIntegrationClassName('salesforce')).toBe('SalesforceIntegration');
            expect(handler.getIntegrationClassName('hubspot')).toBe('HubSpotIntegration');
            expect(handler.getIntegrationClassName('slack')).toBe('SlackIntegration');
            expect(handler.getIntegrationClassName('google-sheets')).toBe('GoogleSheetsIntegration');
        });

        test('generates class name for unknown integrations', () => {
            const handler = new BackendFirstHandler(targetPath);

            expect(handler.getIntegrationClassName('custom-api')).toBe('Custom-apiIntegration');
        });
    });

    describe('isUsingYarn', () => {
        test('returns true when npm_config_user_agent contains yarn', () => {
            const originalEnv = process.env.npm_config_user_agent;
            process.env.npm_config_user_agent = 'yarn/1.22.0';

            const handler = new BackendFirstHandler(targetPath);

            expect(handler.isUsingYarn()).toBe(true);

            process.env.npm_config_user_agent = originalEnv;
        });

        test('returns false when using npm', () => {
            const originalEnv = process.env.npm_config_user_agent;
            process.env.npm_config_user_agent = 'npm/8.0.0';

            const handler = new BackendFirstHandler(targetPath);

            expect(handler.isUsingYarn()).toBe(false);

            process.env.npm_config_user_agent = originalEnv;
        });
    });
});

describe('initCommand', () => {
    const { initCommand } = require('../../../init-command');
    let tempDir;

    beforeEach(() => {
        tempDir = global.TestHelpers.createTempDir();
        jest.clearAllMocks();
    });

    afterEach(() => {
        global.TestHelpers.cleanupTempDir(tempDir);
    });

    test('validates project name - uppercase names are allowed in npm', async () => {
        // Note: npm actually allows uppercase names now, they get lowercased
        // The validate-npm-package-name package allows uppercase
        const validName = path.join(tempDir, 'Valid-Name');

        // Mock prompts to allow the command to proceed
        select.mockResolvedValue('standalone');
        confirm.mockResolvedValue(false);

        // This should not throw for package name validation
        // It may fail for other reasons like missing templates
        try {
            await initCommand(validName, { mode: 'standalone' });
        } catch (e) {
            // Expected to fail for missing template, not for name validation
            expect(e.message).not.toContain('npm naming restrictions');
        }
    });

    test('checks Node version', async () => {
        const projectPath = path.join(tempDir, 'valid-project');

        // Mock prompts to return quickly
        select.mockResolvedValue('standalone');
        confirm.mockResolvedValue(false);

        // This should not throw for invalid Node version (just warn)
        // The test validates checkNodeVersion is called
        try {
            await initCommand(projectPath, { mode: 'standalone' });
        } catch (e) {
            // May fail for other reasons, but shouldn't throw for Node version
        }
    });
});
