/**
 * RFC 0001 Phase 1 Requirements Validation
 * 
 * This suite validates that all Phase 1 requirements from RFC 0001 are implemented:
 * - Enhanced CLI Commands
 * - Local Management GUI
 * - CLI-GUI Communication
 * - Technical Architecture compliance
 */

const { spawn } = require('child_process');
const { expect } = require('@jest/globals');
const axios = require('axios');
const path = require('path');
const fs = require('fs-extra');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

// RFC validation configuration
const RFC_CONFIG = {
  CLI_PATH: path.join(__dirname, '../frigg-cli/index.js'),
  MANAGEMENT_UI_PATH: path.join(__dirname, '../management-ui'),
  UI_PORT: 3004,
  TEST_PROJECT: 'rfc-validation-project'
};

/**
 * RFC 0001 Phase 1 Validation Suite
 */
describe('RFC 0001 Phase 1 Requirements Validation', () => {
  
  let uiServer = null;
  const testProjectPath = path.join(process.cwd(), RFC_CONFIG.TEST_PROJECT);
  
  beforeAll(async () => {
    // Clean up any existing test projects
    if (await fs.pathExists(testProjectPath)) {
      await fs.remove(testProjectPath);
    }
  });

  afterAll(async () => {
    // Clean up
    if (uiServer) {
      uiServer.kill();
    }
    if (await fs.pathExists(testProjectPath)) {
      await fs.remove(testProjectPath);
    }
  });

  /**
   * Enhanced CLI Commands (RFC Section: Enhanced CLI Commands)
   */
  describe('Enhanced CLI Commands', () => {
    
    test('frigg init command exists and works', async () => {
      const result = await runCLICommand(['init', RFC_CONFIG.TEST_PROJECT]);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Creating a new Frigg App');
      expect(await fs.pathExists(testProjectPath)).toBe(true);
    }, 30000);

    test('frigg create command exists', async () => {
      const result = await runCLICommand(['create', '--help']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Create a new integration module');
    });

    test('frigg ui command exists', async () => {
      const result = await runCLICommand(['ui', '--help']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Launch the Frigg management GUI');
    });

    test('frigg install command exists (enhanced)', async () => {
      const result = await runCLICommand(['install', '--help']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Install an API module');
    });

    test('frigg start command exists (with GUI integration)', async () => {
      const result = await runCLICommand(['start', '--help']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Run the backend');
    });

    test('frigg build command exists (multi-environment support)', async () => {
      const result = await runCLICommand(['build', '--help']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Build the serverless application');
    });

    test('frigg deploy command exists (enhanced validation)', async () => {
      const result = await runCLICommand(['deploy', '--help']);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Deploy the serverless application');
    });

  });

  /**
   * Local Management GUI (RFC Section: Local Management GUI)
   */
  describe('Local Management GUI', () => {
    
    beforeAll(async () => {
      // Start UI server for GUI tests
      uiServer = spawn('node', [RFC_CONFIG.CLI_PATH, 'ui', '--no-browser', '--port', RFC_CONFIG.UI_PORT], {
        cwd: testProjectPath,
        stdio: 'pipe'
      });
      
      await waitForServerStart(RFC_CONFIG.UI_PORT);
    });

    test('Management GUI is accessible via frigg ui', async () => {
      const response = await axios.get(`http://localhost:${RFC_CONFIG.UI_PORT}`);
      expect(response.status).toBe(200);
    });

    test('GUI provides Frigg start/stop controls', async () => {
      // Test stop endpoint
      const stopResponse = await axios.post(`http://localhost:${RFC_CONFIG.UI_PORT}/api/frigg/stop`);
      expect(stopResponse.status).toBe(200);
      
      // Test start endpoint
      const startResponse = await axios.post(`http://localhost:${RFC_CONFIG.UI_PORT}/api/frigg/start`);
      expect(startResponse.status).toBe(200);
      
      // Test status endpoint
      const statusResponse = await axios.get(`http://localhost:${RFC_CONFIG.UI_PORT}/api/frigg/status`);
      expect(statusResponse.status).toBe(200);
      expect(statusResponse.data).toHaveProperty('status');
    });

    test('GUI supports Integration Discovery & Installation', async () => {
      // Get integrations list
      const listResponse = await axios.get(`http://localhost:${RFC_CONFIG.UI_PORT}/api/integrations`);
      expect(listResponse.status).toBe(200);
      expect(listResponse.data).toHaveProperty('integrations');
      
      // Install integration
      const installResponse = await axios.post(`http://localhost:${RFC_CONFIG.UI_PORT}/api/integrations/install`, {
        name: 'test-integration'
      });
      expect(installResponse.status).toBe(200);
      expect(installResponse.data).toHaveProperty('integration');
    });

    test('GUI supports Dummy User Management', async () => {
      // Get users list
      const listResponse = await axios.get(`http://localhost:${RFC_CONFIG.UI_PORT}/api/users`);
      expect(listResponse.status).toBe(200);
      expect(listResponse.data).toHaveProperty('users');
      
      // Create test user
      const createResponse = await axios.post(`http://localhost:${RFC_CONFIG.UI_PORT}/api/users`, {
        name: 'Test User',
        email: 'test@example.com'
      });
      expect(createResponse.status).toBe(200);
      expect(createResponse.data).toHaveProperty('user');
    });

    test('GUI supports Connection/Entity Management', async () => {
      const response = await axios.get(`http://localhost:${RFC_CONFIG.UI_PORT}/api/connections`);
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('connections');
    });

    test('GUI supports Environment Variable Editor', async () => {
      // Get environment variables
      const getResponse = await axios.get(`http://localhost:${RFC_CONFIG.UI_PORT}/api/environment`);
      expect(getResponse.status).toBe(200);
      expect(getResponse.data).toHaveProperty('variables');
      
      // Update environment variable
      const updateResponse = await axios.put(`http://localhost:${RFC_CONFIG.UI_PORT}/api/environment`, {
        key: 'TEST_VAR',
        value: 'test_value'
      });
      expect(updateResponse.status).toBe(200);
    });

  });

  /**
   * Technical Architecture (RFC Section: Technical Architecture)
   */
  describe('Technical Architecture', () => {
    
    test('CLI uses Commander.js', async () => {
      const cliCode = await fs.readFile(RFC_CONFIG.CLI_PATH, 'utf8');
      expect(cliCode).toContain('commander');
      expect(cliCode).toContain('Command');
    });

    test('Management UI uses Vite + React', async () => {
      const viteConfig = path.join(RFC_CONFIG.MANAGEMENT_UI_PATH, 'vite.config.js');
      const packageJson = path.join(RFC_CONFIG.MANAGEMENT_UI_PATH, 'package.json');
      
      expect(await fs.pathExists(viteConfig)).toBe(true);
      expect(await fs.pathExists(packageJson)).toBe(true);
      
      const pkg = await fs.readJson(packageJson);
      expect(pkg.dependencies).toHaveProperty('react');
      expect(pkg.devDependencies).toHaveProperty('vite');
    });

    test('Communication layer uses Express API + WebSocket', async () => {
      const serverCode = await fs.readFile(path.join(RFC_CONFIG.MANAGEMENT_UI_PATH, 'server/index.js'), 'utf8');
      expect(serverCode).toContain('express');
      expect(serverCode).toContain('socket.io');
      expect(serverCode).toContain('cors');
    });

    test('Runtime state only (no database)', async () => {
      const serverCode = await fs.readFile(path.join(RFC_CONFIG.MANAGEMENT_UI_PATH, 'server/index.js'), 'utf8');
      
      // Should not contain database connections
      expect(serverCode).not.toContain('mongodb');
      expect(serverCode).not.toContain('mysql');
      expect(serverCode).not.toContain('postgres');
      expect(serverCode).not.toContain('sqlite');
      
      // Should use in-memory state
      expect(serverCode).toContain('mockIntegrations');
      expect(serverCode).toContain('mockUsers');
      expect(serverCode).toContain('mockConnections');
    });

    test('Directory structure matches RFC specification', async () => {
      const devtoolsPath = path.join(__dirname, '..');
      
      // Check frigg-cli directory
      expect(await fs.pathExists(path.join(devtoolsPath, 'frigg-cli'))).toBe(true);
      
      // Check management-ui directory
      expect(await fs.pathExists(path.join(devtoolsPath, 'management-ui'))).toBe(true);
      expect(await fs.pathExists(path.join(devtoolsPath, 'management-ui/src'))).toBe(true);
      expect(await fs.pathExists(path.join(devtoolsPath, 'management-ui/server'))).toBe(true);
      expect(await fs.pathExists(path.join(devtoolsPath, 'management-ui/vite.config.js'))).toBe(true);
    });

  });

  /**
   * CLI-GUI Communication (RFC Section: Communication Layer)
   */
  describe('CLI-GUI Communication', () => {
    
    beforeAll(async () => {
      // Ensure UI server is running
      if (!uiServer) {
        uiServer = spawn('node', [RFC_CONFIG.CLI_PATH, 'ui', '--no-browser', '--port', RFC_CONFIG.UI_PORT], {
          cwd: testProjectPath,
          stdio: 'pipe'
        });
        await waitForServerStart(RFC_CONFIG.UI_PORT);
      }
    });

    test('Express API server responds to CLI commands', async () => {
      const endpoints = [
        '/api/frigg/status',
        '/api/integrations',
        '/api/environment',  
        '/api/users',
        '/api/connections'
      ];
      
      for (const endpoint of endpoints) {
        const response = await axios.get(`http://localhost:${RFC_CONFIG.UI_PORT}${endpoint}`);
        expect(response.status).toBe(200);
      }
    });

    test('WebSocket provides real-time updates', async () => {
      const { io } = require('socket.io-client');
      const client = io(`http://localhost:${RFC_CONFIG.UI_PORT}`);
      
      await new Promise((resolve) => {
        client.on('connect', resolve);
      });
      
      expect(client.connected).toBe(true);
      
      // Test real-time status updates
      await new Promise((resolve) => {
        client.on('frigg:status', (data) => {
          expect(data).toHaveProperty('status');
          resolve();
        });
        
        // Trigger status change
        axios.post(`http://localhost:${RFC_CONFIG.UI_PORT}/api/frigg/start`);
      });
      
      client.close();
    });

  });

  /**
   * Performance Requirements (RFC Section: Success Metrics)
   */
  describe('Performance Requirements', () => {
    
    test('GUI loads in under 2 seconds', async () => {
      const startTime = Date.now();
      
      const response = await axios.get(`http://localhost:${RFC_CONFIG.UI_PORT}`);
      
      const endTime = Date.now();
      const loadTime = endTime - startTime;
      
      expect(response.status).toBe(200);
      expect(loadTime).toBeLessThan(2000); // 2 seconds as per RFC
      
      console.log(`GUI load time: ${loadTime}ms`);
    });

    test('Project initialization under 30 seconds', async () => {
      const startTime = Date.now();
      
      const result = await runCLICommand(['init', 'perf-test-project']);
      
      const endTime = Date.now();
      const initTime = endTime - startTime;
      
      expect(result.code).toBe(0);
      expect(initTime).toBeLessThan(30000); // 30 seconds as per RFC
      
      console.log(`Project initialization time: ${initTime}ms`);
      
      // Clean up
      await fs.remove(path.join(process.cwd(), 'perf-test-project'));
    }, 35000);

  });

});

/**
 * Helper Functions
 */

/**
 * Run CLI command
 */
function runCLICommand(args, cwd = process.cwd()) {
  return new Promise((resolve) => {
    const child = spawn('node', [RFC_CONFIG.CLI_PATH, ...args], {
      cwd,
      stdio: 'pipe'
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * Wait for server to start
 */
async function waitForServerStart(port, maxAttempts = 50) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await axios.get(`http://localhost:${port}/api/frigg/status`);
      return;
    } catch (error) {
      await sleep(200);
    }
  }
  throw new Error(`Server on port ${port} failed to start within timeout`);
}