/**
 * CLI-GUI Integration Tests
 * 
 * Tests the end-to-end communication between CLI commands and Management UI
 * This ensures Phase 1 RFC 0001 requirements are met
 */

const { spawn } = require('child_process');
const { expect } = require('@jest/globals');
const axios = require('axios');
const { io } = require('socket.io-client');
const path = require('path');
const fs = require('fs-extra');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

// Test configuration
const TEST_CONFIG = {
  CLI_PATH: path.join(__dirname, '../frigg-cli/index.js'),
  UI_PORT: 3001,
  API_PORT: 3000,
  TEST_PROJECT_NAME: 'test-frigg-project',
  TEST_TIMEOUT: 30000,
  SERVER_STARTUP_TIMEOUT: 10000
};

// Global test state
let uiServer = null;
let socketClient = null;
let testProjectPath = null;

/**
 * Integration Test Suite: CLI-GUI Communication
 */
describe('CLI-GUI Integration Tests', () => {
  
  beforeAll(async () => {
    // Clean up any existing test projects
    testProjectPath = path.join(process.cwd(), TEST_CONFIG.TEST_PROJECT_NAME);
    if (await fs.pathExists(testProjectPath)) {
      await fs.remove(testProjectPath);
    }
  }, TEST_CONFIG.TEST_TIMEOUT);

  afterAll(async () => {
    // Clean up test project
    if (testProjectPath && await fs.pathExists(testProjectPath)) {
      await fs.remove(testProjectPath);
    }
    
    // Close socket connection
    if (socketClient) {
      socketClient.close();
    }
    
    // Stop UI server
    if (uiServer) {
      uiServer.kill();
    }
  }, TEST_CONFIG.TEST_TIMEOUT);

  /**
   * Test CLI Commands Integration
   */
  describe('CLI Commands', () => {
    
    test('frigg init - creates new project', async () => {
      const result = await runCLICommand(['init', TEST_CONFIG.TEST_PROJECT_NAME]);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Creating a new Frigg App');
      expect(result.stdout).toContain('Happy integrating!');
      
      // Verify project structure
      expect(await fs.pathExists(testProjectPath)).toBe(true);
      expect(await fs.pathExists(path.join(testProjectPath, 'package.json'))).toBe(true);
      expect(await fs.pathExists(path.join(testProjectPath, 'backend'))).toBe(true);
      expect(await fs.pathExists(path.join(testProjectPath, 'frontend'))).toBe(true);
    }, TEST_CONFIG.TEST_TIMEOUT);

    test('frigg ui - starts management server', async () => {
      // Start UI server in background
      uiServer = spawn('node', [TEST_CONFIG.CLI_PATH, 'ui', '--no-browser', '--port', TEST_CONFIG.UI_PORT], {
        cwd: testProjectPath,
        stdio: 'pipe'
      });

      // Wait for server to start
      await waitForServerStart(TEST_CONFIG.UI_PORT);

      // Verify server is running
      const response = await axios.get(`http://localhost:${TEST_CONFIG.UI_PORT}/api/frigg/status`);
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status');
    }, TEST_CONFIG.TEST_TIMEOUT);

    test('frigg create - creates integration module', async () => {
      const result = await runCLICommand(['create', 'test-integration'], testProjectPath);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Creating integration module');
    }, TEST_CONFIG.TEST_TIMEOUT);

  });

  /**
   * Test API Endpoints
   */
  describe('Management UI API', () => {
    
    beforeAll(async () => {
      // Ensure UI server is running
      if (!uiServer) {
        uiServer = spawn('node', [TEST_CONFIG.CLI_PATH, 'ui', '--no-browser', '--port', TEST_CONFIG.UI_PORT], {
          cwd: testProjectPath,
          stdio: 'pipe'
        });
        await waitForServerStart(TEST_CONFIG.UI_PORT);
      }
    });

    test('GET /api/frigg/status - returns server status', async () => {
      const response = await axios.get(`http://localhost:${TEST_CONFIG.UI_PORT}/api/frigg/status`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status');
      expect(['running', 'stopped', 'starting']).toContain(response.data.status);
    });

    test('POST /api/frigg/start - starts Frigg server', async () => {
      const response = await axios.post(`http://localhost:${TEST_CONFIG.UI_PORT}/api/frigg/start`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('message');
      expect(response.data.message).toContain('starting');
    });

    test('GET /api/integrations - returns integrations list', async () => {
      const response = await axios.get(`http://localhost:${TEST_CONFIG.UI_PORT}/api/integrations`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('integrations');
      expect(Array.isArray(response.data.integrations)).toBe(true);
    });

    test('POST /api/integrations/install - installs integration', async () => {
      const response = await axios.post(`http://localhost:${TEST_CONFIG.UI_PORT}/api/integrations/install`, {
        name: 'test-integration'
      });
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('integration');
      expect(response.data.integration.name).toBe('test-integration');
    });

    test('GET /api/environment - returns environment variables', async () => {
      const response = await axios.get(`http://localhost:${TEST_CONFIG.UI_PORT}/api/environment`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('variables');
      expect(typeof response.data.variables).toBe('object');
    });

    test('PUT /api/environment - updates environment variable', async () => {
      const response = await axios.put(`http://localhost:${TEST_CONFIG.UI_PORT}/api/environment`, {
        key: 'TEST_VAR',
        value: 'test_value'
      });
      
      expect(response.status).toBe(200);
      expect(response.data.message).toContain('updated');
    });

    test('GET /api/users - returns users list', async () => {
      const response = await axios.get(`http://localhost:${TEST_CONFIG.UI_PORT}/api/users`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('users');
      expect(Array.isArray(response.data.users)).toBe(true);
    });

    test('POST /api/users - creates test user', async () => {
      const response = await axios.post(`http://localhost:${TEST_CONFIG.UI_PORT}/api/users`, {
        name: 'Test User',
        email: 'test@example.com'
      });
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('user');
      expect(response.data.user.name).toBe('Test User');
    });

    test('GET /api/connections - returns connections list', async () => {
      const response = await axios.get(`http://localhost:${TEST_CONFIG.UI_PORT}/api/connections`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('connections');
      expect(Array.isArray(response.data.connections)).toBe(true);
    });

  });

  /**
   * Test WebSocket Communication
   */
  describe('WebSocket Communication', () => {
    
    beforeAll(async () => {
      // Ensure UI server is running
      if (!uiServer) {
        uiServer = spawn('node', [TEST_CONFIG.CLI_PATH, 'ui', '--no-browser', '--port', TEST_CONFIG.UI_PORT], {
          cwd: testProjectPath,
          stdio: 'pipe'
        });
        await waitForServerStart(TEST_CONFIG.UI_PORT);
      }
      
      // Connect WebSocket client
      socketClient = io(`http://localhost:${TEST_CONFIG.UI_PORT}`);
      await waitForSocketConnection(socketClient);
    });

    test('Socket connection established', async () => {
      expect(socketClient.connected).toBe(true);
    });

    test('Receives frigg:status updates', async () => {
      return new Promise((resolve) => {
        socketClient.on('frigg:status', (data) => {
          expect(data).toHaveProperty('status');
          expect(['running', 'stopped', 'starting']).toContain(data.status);
          resolve();
        });
        
        // Trigger status update
        axios.post(`http://localhost:${TEST_CONFIG.UI_PORT}/api/frigg/start`);
      });
    });

    test('Receives integrations:update events', async () => {
      return new Promise((resolve) => {
        socketClient.on('integrations:update', (data) => {
          expect(data).toHaveProperty('integrations');
          expect(Array.isArray(data.integrations)).toBe(true);
          resolve();
        });
        
        // Trigger integration update
        axios.post(`http://localhost:${TEST_CONFIG.UI_PORT}/api/integrations/install`, {
          name: 'websocket-test-integration'
        });
      });
    });

  });

  /**
   * Test End-to-End Workflows
   */
  describe('End-to-End Workflows', () => {
    
    test('Complete project setup workflow', async () => {
      // 1. Create new project
      const initResult = await runCLICommand(['init', 'e2e-test-project']);
      expect(initResult.code).toBe(0);
      
      const e2eProjectPath = path.join(process.cwd(), 'e2e-test-project');
      
      try {
        // 2. Start UI server
        const uiProcess = spawn('node', [TEST_CONFIG.CLI_PATH, 'ui', '--no-browser', '--port', '3002'], {
          cwd: e2eProjectPath,
          stdio: 'pipe'
        });
        
        await waitForServerStart(3002);
        
        // 3. Install integration via API
        const installResponse = await axios.post('http://localhost:3002/api/integrations/install', {
          name: 'e2e-test-integration'
        });
        expect(installResponse.status).toBe(200);
        
        // 4. Create test user
        const userResponse = await axios.post('http://localhost:3002/api/users', {
          name: 'E2E Test User',
          email: 'e2e@test.com'
        });
        expect(userResponse.status).toBe(200);
        
        // 5. Set environment variable
        const envResponse = await axios.put('http://localhost:3002/api/environment', {
          key: 'E2E_TEST',
          value: 'success'
        });
        expect(envResponse.status).toBe(200);
        
        // Clean up
        uiProcess.kill();
        
      } finally {
        // Clean up test project
        if (await fs.pathExists(e2eProjectPath)) {
          await fs.remove(e2eProjectPath);
        }
      }
    }, TEST_CONFIG.TEST_TIMEOUT);

  });

});

/**
 * Helper Functions
 */

/**
 * Run CLI command and return result
 */
function runCLICommand(args, cwd = process.cwd()) {
  return new Promise((resolve) => {
    const child = spawn('node', [TEST_CONFIG.CLI_PATH, ...args], {
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

/**
 * Wait for WebSocket connection
 */
function waitForSocketConnection(socket, timeout = 5000) {
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }
    
    const timer = setTimeout(() => {
      reject(new Error('WebSocket connection timeout'));
    }, timeout);
    
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    
    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}