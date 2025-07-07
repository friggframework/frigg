const { installCommand } = require('../../../install-command');
const { CommandTester } = require('../../utils/command-tester');
const { MockFactory } = require('../../utils/mock-factory');
const { TestFixtures } = require('../../utils/test-fixtures');

describe('CLI Command: install', () => {
  let commandTester;
  let mocks;
  
  beforeEach(() => {
    mocks = MockFactory.createMockEnvironment();
    commandTester = new CommandTester({
      name: 'install <apiModuleName>',
      description: 'Install an API module',
      action: installCommand,
      options: [
        { flags: '--app-path <path>', description: 'path to Frigg application directory' },
        { flags: '--config <path>', description: 'path to Frigg configuration file' },
        { flags: '--app <path>', description: 'alias for --app-path' }
      ]
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    commandTester.reset();
  });

  describe('Success Cases', () => {
    it('should successfully install an API module with default configuration', async () => {
      // Arrange
      const moduleName = 'salesforce';
      const expectedPackage = '@friggframework/api-module-salesforce';
      
      commandTester
        .mock('./install-command/validate-package', {
          validatePackageExists: jest.fn().mockResolvedValue(true)
        })
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./install-command/install-package', {
          installPackage: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/integration-file', {
          createIntegrationFile: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/backend-js', {
          updateBackendJsFile: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/commit-changes', {
          commitChanges: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([moduleName]);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should successfully install with custom app path', async () => {
      // Arrange
      const moduleName = 'hubspot';
      const customPath = '/custom/app/path';
      
      commandTester
        .mock('./install-command/validate-package', {
          validatePackageExists: jest.fn().mockResolvedValue(true)
        })
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/custom/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./install-command/install-package', {
          installPackage: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/integration-file', {
          createIntegrationFile: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/backend-js', {
          updateBackendJsFile: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/commit-changes', {
          commitChanges: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([moduleName, '--app-path', customPath]);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should handle module names with special characters', async () => {
      // Arrange
      const moduleName = 'google-calendar';
      const expectedPackage = '@friggframework/api-module-google-calendar';
      
      commandTester
        .mock('./install-command/validate-package', {
          validatePackageExists: jest.fn().mockResolvedValue(true)
        })
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./install-command/install-package', {
          installPackage: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/integration-file', {
          createIntegrationFile: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/backend-js', {
          updateBackendJsFile: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/commit-changes', {
          commitChanges: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([moduleName]);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Error Cases', () => {
    it('should handle package not found error', async () => {
      // Arrange
      const moduleName = 'non-existent-module';
      
      commandTester
        .mock('./install-command/validate-package', {
          validatePackageExists: jest.fn().mockRejectedValue(new Error('Package not found'))
        })
        .mock('./install-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([moduleName]);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle invalid backend path error', async () => {
      // Arrange
      const moduleName = 'salesforce';
      
      commandTester
        .mock('./install-command/validate-package', {
          validatePackageExists: jest.fn().mockResolvedValue(true)
        })
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/invalid/path'),
          validateBackendPath: jest.fn().mockImplementation(() => {
            throw new Error('Invalid backend path');
          })
        })
        .mock('./install-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([moduleName]);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle installation failure', async () => {
      // Arrange
      const moduleName = 'salesforce';
      
      commandTester
        .mock('./install-command/validate-package', {
          validatePackageExists: jest.fn().mockResolvedValue(true)
        })
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./install-command/install-package', {
          installPackage: jest.fn().mockRejectedValue(new Error('Installation failed'))
        })
        .mock('./install-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([moduleName]);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle integration file creation failure', async () => {
      // Arrange
      const moduleName = 'salesforce';
      
      commandTester
        .mock('./install-command/validate-package', {
          validatePackageExists: jest.fn().mockResolvedValue(true)
        })
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./install-command/install-package', {
          installPackage: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/integration-file', {
          createIntegrationFile: jest.fn().mockRejectedValue(new Error('File creation failed'))
        })
        .mock('./install-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([moduleName]);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty module name', async () => {
      // Arrange
      commandTester
        .mock('./install-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute(['']);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle module name with invalid characters', async () => {
      // Arrange
      const moduleName = 'invalid@module#name';
      
      commandTester
        .mock('./install-command/validate-package', {
          validatePackageExists: jest.fn().mockRejectedValue(new Error('Invalid package name'))
        })
        .mock('./install-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([moduleName]);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle network timeout during package validation', async () => {
      // Arrange
      const moduleName = 'salesforce';
      
      commandTester
        .mock('./install-command/validate-package', {
          validatePackageExists: jest.fn().mockRejectedValue(new Error('Network timeout'))
        })
        .mock('./install-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([moduleName]);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle permission denied during file operations', async () => {
      // Arrange
      const moduleName = 'salesforce';
      
      commandTester
        .mock('./install-command/validate-package', {
          validatePackageExists: jest.fn().mockResolvedValue(true)
        })
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./install-command/install-package', {
          installPackage: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/integration-file', {
          createIntegrationFile: jest.fn().mockRejectedValue(new Error('EACCES: permission denied'))
        })
        .mock('./install-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([moduleName]);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });
  });

  describe('Option Validation', () => {
    it('should handle --app-path option', async () => {
      // Arrange
      const moduleName = 'salesforce';
      const customPath = '/custom/path';
      
      commandTester
        .mock('./install-command/validate-package', {
          validatePackageExists: jest.fn().mockResolvedValue(true)
        })
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/custom/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./install-command/install-package', {
          installPackage: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/integration-file', {
          createIntegrationFile: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/backend-js', {
          updateBackendJsFile: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/commit-changes', {
          commitChanges: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([moduleName, '--app-path', customPath]);

      // Assert
      expect(result.success).toBe(true);
      expect(result.args).toEqual([moduleName, '--app-path', customPath]);
    });

    it('should handle --config option', async () => {
      // Arrange
      const moduleName = 'salesforce';
      const configPath = '/custom/config.json';
      
      commandTester
        .mock('./install-command/validate-package', {
          validatePackageExists: jest.fn().mockResolvedValue(true)
        })
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./install-command/install-package', {
          installPackage: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/integration-file', {
          createIntegrationFile: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/backend-js', {
          updateBackendJsFile: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/commit-changes', {
          commitChanges: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([moduleName, '--config', configPath]);

      // Assert
      expect(result.success).toBe(true);
      expect(result.args).toEqual([moduleName, '--config', configPath]);
    });

    it('should handle --app alias for --app-path', async () => {
      // Arrange
      const moduleName = 'salesforce';
      const customPath = '/custom/path';
      
      commandTester
        .mock('./install-command/validate-package', {
          validatePackageExists: jest.fn().mockResolvedValue(true)
        })
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/custom/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./install-command/install-package', {
          installPackage: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/integration-file', {
          createIntegrationFile: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/backend-js', {
          updateBackendJsFile: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/commit-changes', {
          commitChanges: jest.fn().mockResolvedValue(true)
        })
        .mock('./install-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([moduleName, '--app', customPath]);

      // Assert
      expect(result.success).toBe(true);
      expect(result.args).toEqual([moduleName, '--app', customPath]);
    });
  });
});