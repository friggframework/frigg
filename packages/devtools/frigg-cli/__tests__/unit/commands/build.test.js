const { buildCommand } = require('../../../build-command');
const { CommandTester } = require('../../utils/command-tester');
const { MockFactory } = require('../../utils/mock-factory');
const { TestFixtures } = require('../../utils/test-fixtures');

describe('CLI Command: build', () => {
  let commandTester;
  let mocks;
  
  beforeEach(() => {
    mocks = MockFactory.createMockEnvironment();
    commandTester = new CommandTester({
      name: 'build',
      description: 'Build the serverless application',
      action: buildCommand,
      options: [
        { flags: '-s, --stage <stage>', description: 'deployment stage', defaultValue: 'dev' },
        { flags: '-v, --verbose', description: 'enable verbose output' },
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
    it('should successfully build with default stage', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./build-command/builder', {
          buildApplication: jest.fn().mockResolvedValue({
            success: true,
            artifacts: ['backend.zip', 'frontend.zip'],
            duration: 30000
          })
        })
        .mock('./build-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should successfully build with production stage', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./build-command/builder', {
          buildApplication: jest.fn().mockResolvedValue({
            success: true,
            artifacts: ['backend.zip', 'frontend.zip'],
            duration: 45000
          })
        })
        .mock('./build-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute(['--stage', 'production']);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should successfully build with verbose output', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./build-command/builder', {
          buildApplication: jest.fn().mockResolvedValue({
            success: true,
            artifacts: ['backend.zip', 'frontend.zip'],
            duration: 30000,
            verbose: true
          })
        })
        .mock('./build-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute(['--verbose']);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should successfully build with custom app path', async () => {
      // Arrange
      const customPath = '/custom/app/path';
      
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/custom/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./build-command/builder', {
          buildApplication: jest.fn().mockResolvedValue({
            success: true,
            artifacts: ['backend.zip', 'frontend.zip'],
            duration: 30000
          })
        })
        .mock('./build-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute(['--app-path', customPath]);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should handle backend-only build', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./build-command/builder', {
          buildApplication: jest.fn().mockResolvedValue({
            success: true,
            artifacts: ['backend.zip'],
            duration: 20000,
            frontendSkipped: true
          })
        })
        .mock('./build-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Error Cases', () => {
    it('should handle invalid app path', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue(null),
          validateBackendPath: jest.fn().mockImplementation(() => {
            throw new Error('Invalid backend path');
          })
        })
        .mock('./build-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle build failure', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./build-command/builder', {
          buildApplication: jest.fn().mockRejectedValue(new Error('Build failed: compilation error'))
        })
        .mock('./build-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle missing dependencies', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./build-command/builder', {
          buildApplication: jest.fn().mockRejectedValue(new Error('Missing dependencies: webpack'))
        })
        .mock('./build-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle insufficient disk space', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./build-command/builder', {
          buildApplication: jest.fn().mockRejectedValue(new Error('ENOSPC: no space left on device'))
        })
        .mock('./build-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle configuration loading error', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./build-command/builder', {
          buildApplication: jest.fn().mockRejectedValue(new Error('Invalid configuration: missing stage'))
        })
        .mock('./build-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute(['--stage', 'invalid-stage']);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty project directory', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue(null),
          validateBackendPath: jest.fn().mockImplementation(() => {
            throw new Error('No backend directory found');
          })
        })
        .mock('./build-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle build timeout', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./build-command/builder', {
          buildApplication: jest.fn().mockRejectedValue(new Error('Build timeout after 300 seconds'))
        })
        .mock('./build-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle partial build success', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./build-command/builder', {
          buildApplication: jest.fn().mockResolvedValue({
            success: false,
            artifacts: ['backend.zip'],
            duration: 30000,
            errors: ['Frontend build failed'],
            warnings: ['Some dependencies are deprecated']
          })
        })
        .mock('./build-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle very large project build', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./build-command/builder', {
          buildApplication: jest.fn().mockResolvedValue({
            success: true,
            artifacts: ['backend.zip', 'frontend.zip'],
            duration: 300000, // 5 minutes
            size: '250MB'
          })
        })
        .mock('./build-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Option Validation', () => {
    it('should validate stage option values', async () => {
      // Arrange
      const validStages = ['dev', 'staging', 'production'];
      
      for (const stage of validStages) {
        commandTester
          .mock('@friggframework/core', {
            findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
            validateBackendPath: jest.fn().mockReturnValue(true)
          })
          .mock('./build-command/builder', {
            buildApplication: jest.fn().mockResolvedValue({
              success: true,
              artifacts: ['backend.zip', 'frontend.zip'],
              duration: 30000,
              stage
            })
          })
          .mock('./build-command/logger', mocks.logger);

        // Act
        const result = await commandTester.execute(['--stage', stage]);

        // Assert
        expect(result.success).toBe(true);
        expect(result.exitCode).toBe(0);
      }
    });

    it('should handle short stage option (-s)', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./build-command/builder', {
          buildApplication: jest.fn().mockResolvedValue({
            success: true,
            artifacts: ['backend.zip', 'frontend.zip'],
            duration: 30000
          })
        })
        .mock('./build-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute(['-s', 'production']);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should handle short verbose option (-v)', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./build-command/builder', {
          buildApplication: jest.fn().mockResolvedValue({
            success: true,
            artifacts: ['backend.zip', 'frontend.zip'],
            duration: 30000,
            verbose: true
          })
        })
        .mock('./build-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute(['-v']);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should handle combined short options', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./build-command/builder', {
          buildApplication: jest.fn().mockResolvedValue({
            success: true,
            artifacts: ['backend.zip', 'frontend.zip'],
            duration: 30000,
            verbose: true
          })
        })
        .mock('./build-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute(['-s', 'production', '-v']);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Performance Tests', () => {
    it('should complete build within reasonable time', async () => {
      // Arrange
      const startTime = Date.now();
      
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./build-command/builder', {
          buildApplication: jest.fn().mockResolvedValue({
            success: true,
            artifacts: ['backend.zip', 'frontend.zip'],
            duration: 30000
          })
        })
        .mock('./build-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);
      const endTime = Date.now();

      // Assert
      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});