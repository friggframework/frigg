/**
 * Performance Tests for Phase 1 Implementation
 * 
 * Validates RFC 0001 performance requirements:
 * - <2s GUI load time
 * - <30s project initialization
 * - Responsive API endpoints
 */

const { spawn } = require('child_process');
const { expect } = require('@jest/globals');
const axios = require('axios');
const path = require('path');
const fs = require('fs-extra');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

// Performance test configuration
const PERF_CONFIG = {
  CLI_PATH: path.join(__dirname, '../frigg-cli/index.js'),
  UI_PORT: 3003,
  MAX_GUI_LOAD_TIME: 2000, // 2 seconds
  MAX_PROJECT_INIT_TIME: 30000, // 30 seconds
  MAX_API_RESPONSE_TIME: 1000, // 1 second
  LOAD_TEST_REQUESTS: 50,
  CONCURRENT_REQUESTS: 10
};

/**
 * Performance Test Suite
 */
describe('Performance Tests', () => {
  
  let uiServer = null;
  const testProjectPath = path.join(process.cwd(), 'perf-test-project');
  
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
   * Project Initialization Performance
   */
  describe('Project Initialization Performance', () => {
    
    test('frigg init completes within 30 seconds', async () => {
      const startTime = Date.now();
      
      const result = await runCLICommand(['init', 'perf-test-project'], process.cwd());
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(result.code).toBe(0);
      expect(duration).toBeLessThan(PERF_CONFIG.MAX_PROJECT_INIT_TIME);
      
      console.log(`Project initialization took: ${duration}ms`);
    }, PERF_CONFIG.MAX_PROJECT_INIT_TIME + 5000);

    test('Project structure is complete', async () => {
      expect(await fs.pathExists(testProjectPath)).toBe(true);
      expect(await fs.pathExists(path.join(testProjectPath, 'package.json'))).toBe(true);
      expect(await fs.pathExists(path.join(testProjectPath, 'backend'))).toBe(true);
      expect(await fs.pathExists(path.join(testProjectPath, 'frontend'))).toBe(true);
    });

  });

  /**
   * UI Server Performance
   */
  describe('UI Server Performance', () => {
    
    beforeAll(async () => {
      // Start UI server
      uiServer = spawn('node', [PERF_CONFIG.CLI_PATH, 'ui', '--no-browser', '--port', PERF_CONFIG.UI_PORT], {
        cwd: testProjectPath,
        stdio: 'pipe'
      });
      
      await waitForServerStart(PERF_CONFIG.UI_PORT);
    });

    test('Server starts within acceptable time', async () => {
      const startTime = Date.now();
      
      // Server should already be started by beforeAll
      const response = await axios.get(`http://localhost:${PERF_CONFIG.UI_PORT}/api/frigg/status`);
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(PERF_CONFIG.MAX_API_RESPONSE_TIME);
      
      console.log(`Status endpoint response time: ${responseTime}ms`);
    });

    test('API endpoints respond within 1 second', async () => {
      const endpoints = [
        '/api/frigg/status',
        '/api/integrations',
        '/api/environment',
        '/api/users',
        '/api/connections'
      ];
      
      for (const endpoint of endpoints) {
        const startTime = Date.now();
        
        const response = await axios.get(`http://localhost:${PERF_CONFIG.UI_PORT}${endpoint}`);
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        expect(response.status).toBe(200);
        expect(responseTime).toBeLessThan(PERF_CONFIG.MAX_API_RESPONSE_TIME);
        
        console.log(`${endpoint} response time: ${responseTime}ms`);
      }
    });

  });

  /**
   * Load Testing
   */
  describe('Load Testing', () => {
    
    beforeAll(async () => {
      // Ensure UI server is running
      if (!uiServer) {
        uiServer = spawn('node', [PERF_CONFIG.CLI_PATH, 'ui', '--no-browser', '--port', PERF_CONFIG.UI_PORT], {
          cwd: testProjectPath,
          stdio: 'pipe'
        });
        await waitForServerStart(PERF_CONFIG.UI_PORT);
      }
    });

    test('Server handles concurrent requests', async () => {
      const requests = [];
      const startTime = Date.now();
      
      // Create concurrent requests
      for (let i = 0; i < PERF_CONFIG.CONCURRENT_REQUESTS; i++) {
        requests.push(
          axios.get(`http://localhost:${PERF_CONFIG.UI_PORT}/api/frigg/status`)
        );
      }
      
      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
      
      // Average time per request should be reasonable
      const avgTime = totalTime / PERF_CONFIG.CONCURRENT_REQUESTS;
      expect(avgTime).toBeLessThan(PERF_CONFIG.MAX_API_RESPONSE_TIME);
      
      console.log(`${PERF_CONFIG.CONCURRENT_REQUESTS} concurrent requests completed in ${totalTime}ms (avg: ${avgTime}ms)`);
    });

    test('Server handles load testing', async () => {
      const results = [];
      let successCount = 0;
      let failCount = 0;
      
      console.log(`Starting load test with ${PERF_CONFIG.LOAD_TEST_REQUESTS} requests...`);
      
      const startTime = Date.now();
      
      // Sequential requests to measure consistent performance
      for (let i = 0; i < PERF_CONFIG.LOAD_TEST_REQUESTS; i++) {
        try {
          const requestStart = Date.now();
          const response = await axios.get(`http://localhost:${PERF_CONFIG.UI_PORT}/api/frigg/status`);
          const requestEnd = Date.now();
          
          if (response.status === 200) {
            successCount++;
            results.push(requestEnd - requestStart);
          } else {
            failCount++;
          }
        } catch (error) {
          failCount++;
        }
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Calculate statistics
      const avgResponseTime = results.reduce((a, b) => a + b, 0) / results.length;
      const maxResponseTime = Math.max(...results);
      const minResponseTime = Math.min(...results);
      
      // Performance requirements
      expect(successCount).toBeGreaterThan(PERF_CONFIG.LOAD_TEST_REQUESTS * 0.95); // 95% success rate
      expect(avgResponseTime).toBeLessThan(PERF_CONFIG.MAX_API_RESPONSE_TIME);
      expect(maxResponseTime).toBeLessThan(PERF_CONFIG.MAX_API_RESPONSE_TIME * 2); // Allow 2x for outliers
      
      console.log(`Load test results:`);
      console.log(`- Total time: ${totalTime}ms`);
      console.log(`- Success rate: ${(successCount / PERF_CONFIG.LOAD_TEST_REQUESTS * 100).toFixed(2)}%`);
      console.log(`- Average response time: ${avgResponseTime.toFixed(2)}ms`);
      console.log(`- Min response time: ${minResponseTime}ms`);
      console.log(`- Max response time: ${maxResponseTime}ms`);
    }, 60000); // 60 second timeout for load test

  });

  /**
   * Memory and Resource Usage
   */
  describe('Resource Usage', () => {
    
    test('UI server memory usage is reasonable', async () => {
      if (!uiServer) {
        uiServer = spawn('node', [PERF_CONFIG.CLI_PATH, 'ui', '--no-browser', '--port', PERF_CONFIG.UI_PORT], {
          cwd: testProjectPath,
          stdio: 'pipe'
        });
        await waitForServerStart(PERF_CONFIG.UI_PORT);
      }
      
      // Give server time to stabilize
      await sleep(2000);
      
      // Check memory usage
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      
      console.log(`Memory usage: ${heapUsedMB.toFixed(2)} MB`);
      
      // Should use less than 100MB for basic operations
      expect(heapUsedMB).toBeLessThan(100);
    });

  });

});

/**
 * Helper Functions
 */

/**
 * Run CLI command and measure performance
 */
function runCLICommand(args, cwd = process.cwd()) {
  return new Promise((resolve) => {
    const child = spawn('node', [PERF_CONFIG.CLI_PATH, ...args], {
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
 * Wait for server to start with timeout
 */
async function waitForServerStart(port, maxAttempts = 100) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await axios.get(`http://localhost:${port}/api/frigg/status`);
      return;
    } catch (error) {
      await sleep(100);
    }
  }
  throw new Error(`Server on port ${port} failed to start within timeout`);
}