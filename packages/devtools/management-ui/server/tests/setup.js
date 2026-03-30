import { vi, afterAll, beforeEach } from 'vitest'
import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load test environment variables
config({ path: path.join(__dirname, '../.env.test') })

// Set up test environment
process.env.NODE_ENV = 'test'
process.env.PORT = '3211' // Use different port for tests
process.env.PROJECT_ROOT = path.join(__dirname, '../../test-fixtures/sample-project')

// Mock WebSocket broadcasts during tests
global.mockWebSocket = {
  emit: vi.fn(),
  broadcast: vi.fn(),
  on: vi.fn(),
  to: vi.fn(() => ({
    emit: vi.fn()
  }))
}

// Mock process manager
global.mockProcessManager = {
  getStatus: vi.fn(() => ({ status: 'stopped', pid: null })),
  getLogs: vi.fn(() => []),
  getMetrics: vi.fn(() => ({ cpu: 0, memory: 0 })),
  start: vi.fn(() => Promise.resolve({ status: 'running', pid: 12345 })),
  stop: vi.fn(() => Promise.resolve()),
  restart: vi.fn(() => Promise.resolve({ status: 'running', pid: 12346 })),
  addStatusListener: vi.fn()
}

// Clean up after all tests
afterAll(async () => {
  // Close any open connections
  if (global.testServer) {
    await new Promise(resolve => global.testServer.close(resolve))
  }
})

// Clear all mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
})
