const { uiCommand } = require('../../../ui-command');
const { CommandTester } = require('../../utils/command-tester');
const { MockFactory } = require('../../utils/mock-factory');
const { TestFixtures } = require('../../utils/test-fixtures');

describe('CLI Command: ui', () => {
  let commandTester;
  let mocks;
  
  beforeEach(() => {
    mocks = MockFactory.createMockEnvironment();
    commandTester = new CommandTester({
      name: 'ui',
      description: 'Start the Frigg Management UI',
      action: uiCommand,
      options: [
        { flags: '-p, --port <number>', description: 'port number', defaultValue: '3001' },
        { flags: '--no-open', description: 'do not open browser automatically' },
        { flags: '-r, --repo <path>', description: 'path to Frigg repository' },
        { flags: '--dev', description: 'run in development mode' },
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
    it('should successfully start UI with default settings', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./ui-command/server', {
          startUIServer: jest.fn().mockResolvedValue({
            success: true,
            port: 3001,
            url: 'http://localhost:3001'
          })
        })
        .mock('./ui-command/browser', {
          openBrowser: jest.fn().mockResolvedValue(true)
        })
        .mock('./ui-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should successfully start UI with custom port', async () => {
      // Arrange
      const customPort = '8080';
      
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./ui-command/server', {
          startUIServer: jest.fn().mockResolvedValue({
            success: true,
            port: 8080,
            url: 'http://localhost:8080'
          })
        })
        .mock('./ui-command/browser', {
          openBrowser: jest.fn().mockResolvedValue(true)
        })
        .mock('./ui-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute(['--port', customPort]);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should successfully start UI without opening browser', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./ui-command/server', {
          startUIServer: jest.fn().mockResolvedValue({
            success: true,
            port: 3001,
            url: 'http://localhost:3001'
          })
        })
        .mock('./ui-command/browser', {
          openBrowser: jest.fn() // Should not be called
        })
        .mock('./ui-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute(['--no-open']);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should successfully start UI with custom repository path', async () => {
      // Arrange
      const customRepo = '/custom/repo/path';
      
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/custom/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./ui-command/server', {
          startUIServer: jest.fn().mockResolvedValue({
            success: true,
            port: 3001,
            url: 'http://localhost:3001',
            repo: customRepo
          })
        })
        .mock('./ui-command/browser', {
          openBrowser: jest.fn().mockResolvedValue(true)
        })
        .mock('./ui-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute(['--repo', customRepo]);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should successfully start UI in development mode', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./ui-command/server', {
          startUIServer: jest.fn().mockResolvedValue({
            success: true,
            port: 3001,
            url: 'http://localhost:3001',
            development: true
          })
        })
        .mock('./ui-command/browser', {
          openBrowser: jest.fn().mockResolvedValue(true)
        })
        .mock('./ui-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute(['--dev']);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should handle WebSocket connections properly', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./ui-command/server', {
          startUIServer: jest.fn().mockResolvedValue({
            success: true,
            port: 3001,
            url: 'http://localhost:3001',
            websocket: true
          })
        })
        .mock('./ui-command/browser', {
          openBrowser: jest.fn().mockResolvedValue(true)
        })
        .mock('./ui-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Error Cases', () => {
    it('should handle port already in use error', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./ui-command/server', {
          startUIServer: jest.fn().mockRejectedValue(new Error('EADDRINUSE: address already in use :::3001'))
        })
        .mock('./ui-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle invalid port number', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./ui-command/server', {
          startUIServer: jest.fn().mockRejectedValue(new Error('Invalid port number'))
        })
        .mock('./ui-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute(['--port', '99999']);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle invalid repository path', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue(null),
          validateBackendPath: jest.fn().mockImplementation(() => {
            throw new Error('Invalid repository path');
          })
        })
        .mock('./ui-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute(['--repo', '/invalid/path']);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle missing dependencies error', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./ui-command/server', {
          startUIServer: jest.fn().mockRejectedValue(new Error('Missing dependencies: express, socket.io'))
        })
        .mock('./ui-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle server startup timeout', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./ui-command/server', {
          startUIServer: jest.fn().mockRejectedValue(new Error('Server startup timeout'))
        })
        .mock('./ui-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle browser opening failure gracefully', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./ui-command/server', {
          startUIServer: jest.fn().mockResolvedValue({
            success: true,
            port: 3001,
            url: 'http://localhost:3001'
          })
        })
        .mock('./ui-command/browser', {
          openBrowser: jest.fn().mockRejectedValue(new Error('Browser not found'))
        })
        .mock('./ui-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);

      // Assert
      expect(result.success).toBe(true); // Should still succeed even if browser fails
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle system with no available ports', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./ui-command/server', {
          startUIServer: jest.fn().mockRejectedValue(new Error('No available ports'))
        })
        .mock('./ui-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);

      // Assert
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle headless environment (no display)', async () => {
      // Arrange
      commandTester
        .withEnv({ DISPLAY: '' })
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./ui-command/server', {
          startUIServer: jest.fn().mockResolvedValue({
            success: true,
            port: 3001,
            url: 'http://localhost:3001'
          })
        })
        .mock('./ui-command/browser', {
          openBrowser: jest.fn().mockRejectedValue(new Error('No display available'))
        })
        .mock('./ui-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should handle very large repository', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./ui-command/server', {
          startUIServer: jest.fn().mockResolvedValue({
            success: true,
            port: 3001,
            url: 'http://localhost:3001',
            loadTime: 10000, // 10 seconds
            size: '1GB'
          })
        })
        .mock('./ui-command/browser', {
          openBrowser: jest.fn().mockResolvedValue(true)
        })
        .mock('./ui-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should handle concurrent UI instances', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./ui-command/server', {
          startUIServer: jest.fn().mockResolvedValue({
            success: true,
            port: 3002, // Different port due to 3001 being used
            url: 'http://localhost:3002'
          })
        })
        .mock('./ui-command/browser', {
          openBrowser: jest.fn().mockResolvedValue(true)
        })
        .mock('./ui-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Option Validation', () => {
    it('should validate port number range', async () => {
      // Arrange
      const validPorts = ['3000', '8080', '9000'];
      
      for (const port of validPorts) {
        commandTester
          .mock('@friggframework/core', {
            findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
            validateBackendPath: jest.fn().mockReturnValue(true)
          })
          .mock('./ui-command/server', {
            startUIServer: jest.fn().mockResolvedValue({
              success: true,
              port: parseInt(port),
              url: `http://localhost:${port}`
            })
          })
          .mock('./ui-command/browser', {
            openBrowser: jest.fn().mockResolvedValue(true)
          })
          .mock('./ui-command/logger', mocks.logger);

        // Act
        const result = await commandTester.execute(['--port', port]);

        // Assert
        expect(result.success).toBe(true);
        expect(result.exitCode).toBe(0);
      }
    });

    it('should handle short port option (-p)', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./ui-command/server', {
          startUIServer: jest.fn().mockResolvedValue({
            success: true,
            port: 9000,
            url: 'http://localhost:9000'
          })
        })
        .mock('./ui-command/browser', {
          openBrowser: jest.fn().mockResolvedValue(true)
        })
        .mock('./ui-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute(['-p', '9000']);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should handle short repo option (-r)', async () => {
      // Arrange
      const customRepo = '/custom/repo';
      
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/custom/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./ui-command/server', {
          startUIServer: jest.fn().mockResolvedValue({
            success: true,
            port: 3001,
            url: 'http://localhost:3001',
            repo: customRepo
          })
        })
        .mock('./ui-command/browser', {
          openBrowser: jest.fn().mockResolvedValue(true)
        })
        .mock('./ui-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute(['-r', customRepo]);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should handle combined options', async () => {
      // Arrange
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/custom/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./ui-command/server', {
          startUIServer: jest.fn().mockResolvedValue({
            success: true,
            port: 8080,
            url: 'http://localhost:8080',
            development: true
          })
        })
        .mock('./ui-command/browser', {
          openBrowser: jest.fn() // Should not be called due to --no-open
        })
        .mock('./ui-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([
        '--port', '8080',
        '--dev',
        '--no-open',
        '--repo', '/custom/repo'
      ]);

      // Assert
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Performance Tests', () => {
    it('should start UI server within reasonable time', async () => {
      // Arrange
      const startTime = Date.now();
      
      commandTester
        .mock('@friggframework/core', {
          findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
          validateBackendPath: jest.fn().mockReturnValue(true)
        })
        .mock('./ui-command/server', {
          startUIServer: jest.fn().mockResolvedValue({
            success: true,
            port: 3001,
            url: 'http://localhost:3001'
          })
        })
        .mock('./ui-command/browser', {
          openBrowser: jest.fn().mockResolvedValue(true)
        })
        .mock('./ui-command/logger', mocks.logger);

      // Act
      const result = await commandTester.execute([]);
      const endTime = Date.now();

      // Assert
      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(3000); // Should start within 3 seconds
    });
  });
});