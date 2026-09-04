/**
 * Test suite for install command
 *
 * Tests the ACTUAL Frigg implementation including:
 * - Package search and selection (mocked - external npm)
 * - Package installation via npm (mocked - external)
 * - Integration file creation (REAL - tests actual file generation)
 * - Backend.js updates (REAL - tests actual file parsing/updating)
 * - Git commits (mocked - external)
 * - Environment variable handling (mocked - interactive)
 * - Label sanitization (REAL - tests actual regex logic)
 */

// Mock ONLY external boundaries - let Frigg logic run!
jest.mock('fs-extra'); // Mock at I/O level
jest.mock('../../../install-command/install-package', () => ({
  installPackage: jest.fn() // External: npm install
}));
jest.mock('../../../install-command/commit-changes', () => ({
  commitChanges: jest.fn() // External: git commands
}));
jest.mock('../../../install-command/environment-variables', () => ({
  handleEnvVariables: jest.fn() // External: interactive prompts
}));
jest.mock('../../../install-command/validate-package', () => ({
  validatePackageExists: jest.fn(), // External: npm registry
  searchAndSelectPackage: jest.fn() // External: interactive selection
}));
jest.mock('@friggframework/core', () => ({
  findNearestBackendPackageJson: jest.fn(),
  validateBackendPath: jest.fn()
}));

// DON'T mock these - let them run to test actual Frigg logic:
// - createIntegrationFile (tests file generation)
// - updateBackendJsFile (tests file parsing)
// - logger (just console.log, we'll spy on console)
// - getIntegrationTemplate (tests template generation)

// Require after mocks
const fs = require('fs-extra');
const { installPackage } = require('../../../install-command/install-package');
const { commitChanges } = require('../../../install-command/commit-changes');
const { handleEnvVariables } = require('../../../install-command/environment-variables');
const { validatePackageExists, searchAndSelectPackage } = require('../../../install-command/validate-package');
const { findNearestBackendPackageJson, validateBackendPath } = require('@friggframework/core');
const { installCommand } = require('../../../install-command');

describe('CLI Command: install', () => {
  let processExitSpy;
  let consoleLogSpy;
  let consoleErrorSpy;
  const mockBackendPath = '/mock/backend/package.json';
  const mockBackendDir = '/mock/backend';

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock process.exit to prevent actual exit
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation();

    // Spy on console for logger (don't mock logger - test it!)
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Setup fs-extra mocks - Let Frigg code run, just mock I/O
    fs.ensureDirSync = jest.fn();
    fs.writeFileSync = jest.fn();
    fs.readFileSync = jest.fn().mockReturnValue(`
      // Sample backend.js file
      const integrations = [
        // Existing integrations
      ];

      module.exports = {
        integrations: []
      };
    `);
    fs.existsSync = jest.fn().mockReturnValue(true);

    // Setup default successful mocks for external boundaries
    searchAndSelectPackage.mockResolvedValue(['@friggframework/api-module-slack']);
    findNearestBackendPackageJson.mockReturnValue(mockBackendPath);
    validateBackendPath.mockReturnValue(true);
    validatePackageExists.mockResolvedValue(true);
    installPackage.mockReturnValue(undefined);
    handleEnvVariables.mockResolvedValue(undefined);

    // Mock the dynamic require() of installed package using jest.doMock
    const path = require('path');
    const slackModulePath = path.resolve(mockBackendPath, '../../node_modules/@friggframework/api-module-slack');

    jest.doMock(slackModulePath, () => ({
      Config: { label: 'Slack' },
      Api: class SlackApi {}
    }), { virtual: true });
  });

  afterEach(() => {
    processExitSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.resetModules(); // Clear module cache after each test
  });

  describe('Success Cases', () => {
    it('should orchestrate complete installation workflow', async () => {
      await installCommand('slack');

      // Verify external boundaries called
      expect(searchAndSelectPackage).toHaveBeenCalledWith('slack');
      expect(findNearestBackendPackageJson).toHaveBeenCalled();
      expect(validateBackendPath).toHaveBeenCalledWith(mockBackendPath);
      expect(validatePackageExists).toHaveBeenCalledWith('@friggframework/api-module-slack');
      expect(installPackage).toHaveBeenCalledWith(mockBackendPath, '@friggframework/api-module-slack');
    });

    it('should create integration file with correct path and content', async () => {
      await installCommand('slack');

      // Verify directory creation
      expect(fs.ensureDirSync).toHaveBeenCalledWith(
        expect.stringMatching(/src\/integrations$/)
      );

      // Verify integration file written with correct path
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/SlackIntegration\.js$/),
        expect.any(String)
      );

      // Get the actual content that was written
      const writeCall = fs.writeFileSync.mock.calls.find(call =>
        call[0].includes('SlackIntegration.js')
      );

      expect(writeCall).toBeDefined();
      const [filePath, content] = writeCall;

      // Verify file content contains valid integration class
      expect(content).toContain('class SlackIntegration extends IntegrationBase');
      expect(content).toContain('@friggframework/core');
      expect(content).toContain('@friggframework/api-module-slack');
    });

    it('should generate valid JavaScript template', async () => {
      await installCommand('slack');

      const writeCall = fs.writeFileSync.mock.calls.find(call =>
        call[0].includes('SlackIntegration.js')
      );

      const [, content] = writeCall;

      // Verify template has required structure
      expect(content).toMatch(/class \w+Integration extends IntegrationBase/);
      expect(content).toContain('static Config =');
      expect(content).toContain('static Options =');
      expect(content).toContain('static modules =');

      // Verify template is syntactically valid (no unclosed braces, etc)
      expect(content.split('{').length).toBe(content.split('}').length);
    });

    it('should update backend.js with integration import', async () => {
      await installCommand('slack');

      // Verify backend.js was read
      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/backend\.js$/),
        'utf-8'
      );

      // Verify backend.js was written back with import
      const backendWriteCall = fs.writeFileSync.mock.calls.find(call =>
        call[0].includes('backend.js')
      );

      expect(backendWriteCall).toBeDefined();
      const [, updatedBackend] = backendWriteCall;

      // Verify import statement added
      expect(updatedBackend).toContain('const SlackIntegration = require');
      expect(updatedBackend).toContain('./src/integrations/SlackIntegration');

      // Verify integration added to array
      expect(updatedBackend).toContain('SlackIntegration,');
    });

    it('should commit changes after file operations', async () => {
      await installCommand('slack');

      expect(commitChanges).toHaveBeenCalledWith(mockBackendPath, 'Slack');
    });

    it('should handle environment variables after installation', async () => {
      await installCommand('slack');

      expect(handleEnvVariables).toHaveBeenCalledWith(
        mockBackendPath,
        expect.stringContaining('@friggframework/api-module-slack')
      );
    });

    it('should log info messages during installation', async () => {
      await installCommand('slack');

      // Verify logger actually logged (we spy on console)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Successfully installed @friggframework/api-module-slack')
      );
    });

    it('should install multiple packages sequentially', async () => {
      searchAndSelectPackage.mockResolvedValue([
        '@friggframework/api-module-slack',
        '@friggframework/api-module-hubspot'
      ]);

      // Mock HubSpot module (Slack already mocked in beforeEach)
      const path = require('path');
      const hubspotPath = path.resolve(mockBackendPath, '../../node_modules/@friggframework/api-module-hubspot');

      jest.doMock(hubspotPath, () => ({
        Config: { label: 'HubSpot' },
        Api: class HubSpotApi {}
      }), { virtual: true });

      await installCommand('crm');

      expect(validatePackageExists).toHaveBeenCalledTimes(2);
      expect(installPackage).toHaveBeenCalledTimes(2);

      // Verify TWO integration files created
      const integrationFiles = fs.writeFileSync.mock.calls.filter(call =>
        call[0].includes('Integration.js') && !call[0].includes('backend.js')
      );
      expect(integrationFiles.length).toBe(2);

      // Verify both files have correct names
      expect(integrationFiles[0][0]).toContain('SlackIntegration.js');
      expect(integrationFiles[1][0]).toContain('HubSpotIntegration.js');
    });

    it('should sanitize label by removing invalid characters', async () => {
      // Mock different package with special characters in label
      searchAndSelectPackage.mockResolvedValue(['@friggframework/api-module-google-drive']);

      const path = require('path');
      const googleDrivePath = path.resolve(mockBackendPath, '../../node_modules/@friggframework/api-module-google-drive');

      jest.doMock(googleDrivePath, () => ({
        Config: { label: 'Google<Drive>' },  // Has invalid characters
        Api: class GoogleDriveApi {}
      }), { virtual: true });

      await installCommand('google-drive');

      // Verify sanitized label used in file name
      const writeCall = fs.writeFileSync.mock.calls.find(call =>
        call[0].includes('Integration.js')
      );

      // Should be GoogleDrive, not Google<Drive>
      expect(writeCall[0]).toContain('GoogleDriveIntegration.js');
      expect(writeCall[0]).not.toContain('<');
      expect(writeCall[0]).not.toContain('>');

      // Verify content uses sanitized name
      expect(writeCall[1]).toContain('class GoogleDriveIntegration');
      expect(writeCall[1]).not.toContain('Google<Drive>');
    });

    it('should sanitize label by removing spaces', async () => {
      // Mock different package with spaces in label
      searchAndSelectPackage.mockResolvedValue(['@friggframework/api-module-google-calendar']);

      const path = require('path');
      const googleCalendarPath = path.resolve(mockBackendPath, '../../node_modules/@friggframework/api-module-google-calendar');

      jest.doMock(googleCalendarPath, () => ({
        Config: { label: 'Google Calendar' },  // Has spaces
        Api: class GoogleCalendarApi {}
      }), { virtual: true });

      await installCommand('google-calendar');

      // Verify sanitized label used in file name (no spaces)
      const writeCall = fs.writeFileSync.mock.calls.find(call =>
        call[0].includes('Integration.js')
      );

      expect(writeCall[0]).toContain('GoogleCalendarIntegration.js');
      expect(writeCall[0]).not.toContain(' ');

      // Verify content uses sanitized name
      expect(writeCall[1]).toContain('class GoogleCalendarIntegration');
      expect(writeCall[1]).not.toMatch(/class Google Calendar/);
    });
  });

  describe('Early Exit Cases', () => {
    it('should return early when no packages selected', async () => {
      searchAndSelectPackage.mockResolvedValue([]);

      await installCommand('slack');

      expect(findNearestBackendPackageJson).not.toHaveBeenCalled();
      expect(validatePackageExists).not.toHaveBeenCalled();
      expect(installPackage).not.toHaveBeenCalled();
    });

    it('should return early when packages is null', async () => {
      searchAndSelectPackage.mockResolvedValue(null);

      await installCommand('slack');

      expect(findNearestBackendPackageJson).not.toHaveBeenCalled();
    });

    it('should return early when packages is undefined', async () => {
      searchAndSelectPackage.mockResolvedValue(undefined);

      await installCommand('slack');

      expect(findNearestBackendPackageJson).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should log error and exit on searchAndSelectPackage failure', async () => {
      const error = new Error('Search failed');
      searchAndSelectPackage.mockRejectedValue(error);

      await installCommand('slack');

      // Verify error logged via console.error (we spy on it)
      expect(consoleErrorSpy).toHaveBeenCalledWith('An error occurred:', error);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should log error and exit on validatePackageExists failure', async () => {
      const error = new Error('Package not found');
      validatePackageExists.mockRejectedValue(error);

      await installCommand('slack');

      expect(consoleErrorSpy).toHaveBeenCalledWith('An error occurred:', error);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should log error and exit on installPackage failure', async () => {
      const error = new Error('Installation failed');
      installPackage.mockImplementation(() => {
        throw error;
      });

      await installCommand('slack');

      expect(consoleErrorSpy).toHaveBeenCalledWith('An error occurred:', error);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should log error and exit on file write failure (createIntegrationFile)', async () => {
      // Make fs.writeFileSync throw - tests REAL error path
      const error = new Error('EACCES: permission denied');
      fs.writeFileSync.mockImplementation(() => {
        throw error;
      });

      await installCommand('slack');

      expect(consoleErrorSpy).toHaveBeenCalledWith('An error occurred:', expect.any(Error));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should log error and exit on backend.js read failure', async () => {
      // Make fs.readFileSync throw - tests REAL error path
      const error = new Error('ENOENT: file not found');
      fs.readFileSync.mockImplementation(() => {
        throw error;
      });

      await installCommand('slack');

      expect(consoleErrorSpy).toHaveBeenCalledWith('An error occurred:', expect.any(Error));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should log error and exit on handleEnvVariables failure', async () => {
      const error = new Error('Env variables failed');
      handleEnvVariables.mockRejectedValue(error);

      await installCommand('slack');

      expect(consoleErrorSpy).toHaveBeenCalledWith('An error occurred:', error);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
