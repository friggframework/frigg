/**
 * Jest Test Setup
 *
 * This file runs before each test file and sets up the testing environment.
 */

const dotenv = require('dotenv');
const path = require('path');

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.test') });

// Set test environment
process.env.NODE_ENV = 'test';

// Global test timeout
jest.setTimeout(30000);

// Silence console logs during tests (optional - comment out for debugging)
// global.console = {
//     ...console,
//     log: jest.fn(),
//     info: jest.fn(),
//     warn: jest.fn(),
// };

// Clean up after all tests
afterAll(async () => {
    // Add any global cleanup here
});
