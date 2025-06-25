/**
 * Jest Setup for Integration Tests
 */

// Increase timeout for integration tests
jest.setTimeout(60000);

// Global test utilities
global.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Mock console methods to reduce noise during tests
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Only log errors during tests unless verbose mode is enabled
if (!process.env.VERBOSE_TESTS) {
  console.log = () => {};
  console.warn = () => {};
  console.error = (...args) => {
    // Still log actual errors
    if (args.some(arg => arg instanceof Error)) {
      originalConsoleError(...args);
    }
  };
}

// Restore console methods after tests
afterAll(() => {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});

// Global cleanup function
global.cleanup = async () => {
  // Kill any remaining processes
  if (global.testProcesses) {
    global.testProcesses.forEach(proc => {
      if (proc && !proc.killed) {
        proc.kill();
      }
    });
    global.testProcesses = [];
  }
};

// Setup global process tracking
global.testProcesses = [];

// Track processes for cleanup
const originalSpawn = require('child_process').spawn;
require('child_process').spawn = function(...args) {
  const proc = originalSpawn.apply(this, args);
  if (global.testProcesses) {
    global.testProcesses.push(proc);
  }
  return proc;
};

// Cleanup on process exit
process.on('exit', global.cleanup);
process.on('SIGINT', global.cleanup);
process.on('SIGTERM', global.cleanup);