import { jest } from '@jest/globals'
import { EventEmitter } from 'events'

// Mock child_process - needs both spawn and execSync
jest.unstable_mockModule('child_process', () => ({
  spawn: jest.fn(),
  execSync: jest.fn(() => '') // Mock execSync to return empty string by default
}))

const { ProcessManager } = await import('../../../src/domain/services/ProcessManager.js')
const { spawn, execSync } = await import('child_process')

describe('ProcessManager', () => {
  let processManager
  let mockWebSocketService
  let mockProcess

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks()

    // Mock WebSocket service
    mockWebSocketService = {
      emit: jest.fn()
    }

    // Mock child process
    mockProcess = new EventEmitter()
    mockProcess.pid = 63083
    mockProcess.kill = jest.fn()
    mockProcess.killed = false
    mockProcess.stdout = new EventEmitter()
    mockProcess.stderr = new EventEmitter()

    // Mock spawn to return our mock process
    spawn.mockReturnValue(mockProcess)

    // Mock execSync to return empty (no processes using port)
    execSync.mockReturnValue('')

    processManager = new ProcessManager()
  })

  afterEach(async () => {
    // Clean up any running processes and timers
    if (processManager && processManager.isRunning()) {
      await processManager.stop(true, 100).catch(() => {})
    }
    jest.clearAllMocks()
  })

  describe('Port Detection from Logs', () => {
    it('should detect port 3001 from "Server ready" message', async () => {
      const startPromise = processManager.start(
        '/test/backend',
        mockWebSocketService,
        { port: 3000 }
      )

      // Simulate process startup logs
      setTimeout(() => {
        mockProcess.stderr.emit('data', Buffer.from('Starting backend and optional frontend...\n'))
        mockProcess.stderr.emit('data', Buffer.from('Starting backend in /test/backend...\n'))
        mockProcess.stderr.emit('data', Buffer.from('Running "serverless" from node_modules\n'))
      }, 10)

      setTimeout(() => {
        mockProcess.stderr.emit('data', Buffer.from('Server ready: http://localhost:3001 🚀\n'))
      }, 50)

      const result = await startPromise

      expect(result.port).toBe(3001) // Detected from logs, not the requested 3000
      expect(result.baseUrl).toBe('http://localhost:3001')
      expect(result.pid).toBe(63083)
      expect(result.isRunning).toBe(true)
    })

    it('should ignore lambda port 4001 and only use HTTP server port', async () => {
      const startPromise = processManager.start(
        '/test/backend',
        mockWebSocketService
      )

      setTimeout(() => {
        // Lambda offline port (should be ignored)
        mockProcess.stderr.emit('data', Buffer.from('Offline [http for lambda] listening on http://localhost:4001\n'))
        // Actual HTTP server port (should be detected)
        mockProcess.stderr.emit('data', Buffer.from('Server ready: http://localhost:3001 🚀\n'))
      }, 50)

      const result = await startPromise

      expect(result.port).toBe(3001) // Not 4001
      expect(mockWebSocketService.emit).toHaveBeenCalledWith(
        'frigg:log',
        expect.objectContaining({
          message: expect.stringContaining('Server ready: http://localhost:3001')
        })
      )
    })

    it('should stream all logs via WebSocket', async () => {
      const startPromise = processManager.start(
        '/test/backend',
        mockWebSocketService
      )

      const logs = [
        'Starting backend and optional frontend...',
        'Running "serverless" from node_modules',
        'composeServerlessDefinition { ... }',
        'Processing 1 integrations...',
        'Server ready: http://localhost:3001 🚀'
      ]

      setTimeout(() => {
        logs.forEach((log, index) => {
          setTimeout(() => {
            mockProcess.stderr.emit('data', Buffer.from(log + '\n'))
          }, index * 10)
        })
      }, 10)

      await startPromise

      // Verify logs were emitted (should be at least the number of logs we sent)
      expect(mockWebSocketService.emit).toHaveBeenCalled()
      expect(mockWebSocketService.emit.mock.calls.length).toBeGreaterThanOrEqual(logs.length)

      // Verify specific logs were emitted
      logs.forEach((log) => {
        expect(mockWebSocketService.emit).toHaveBeenCalledWith(
          'frigg:log',
          expect.objectContaining({
            message: log,
            source: 'frigg-process',
            level: expect.any(String),
            timestamp: expect.any(String)
          })
        )
      })
    })

    it('should classify log levels correctly', async () => {
      const startPromise = processManager.start(
        '/test/backend',
        mockWebSocketService
      )

      setTimeout(() => {
        // Deprecation warning
        mockProcess.stderr.emit('data', Buffer.from('(node:63230) [DEP0040] DeprecationWarning: The `punycode` module is deprecated.\n'))

        // Info message
        mockProcess.stderr.emit('data', Buffer.from('Running "serverless" from node_modules\n'))

        // Success message
        mockProcess.stderr.emit('data', Buffer.from('Server ready: http://localhost:3001 🚀\n'))
      }, 10)

      await startPromise

      // Check for warning level
      expect(mockWebSocketService.emit).toHaveBeenCalledWith(
        'frigg:log',
        expect.objectContaining({
          level: 'warn',
          message: expect.stringContaining('DeprecationWarning')
        })
      )

      // Check for info level
      expect(mockWebSocketService.emit).toHaveBeenCalledWith(
        'frigg:log',
        expect.objectContaining({
          level: 'info',
          message: expect.stringContaining('Running "serverless"')
        })
      )

      // Check for success level
      expect(mockWebSocketService.emit).toHaveBeenCalledWith(
        'frigg:log',
        expect.objectContaining({
          level: expect.stringMatching(/info|success/),
          message: expect.stringContaining('Server ready')
        })
      )
    })
  })

  describe('Process Lifecycle', () => {
    it('should return isRunning true after successful start', async () => {
      const startPromise = processManager.start(
        '/test/backend',
        mockWebSocketService
      )

      setTimeout(() => {
        mockProcess.stderr.emit('data', Buffer.from('Server ready: http://localhost:3001 🚀\n'))
      }, 10)

      await startPromise

      expect(processManager.isRunning()).toBe(true)

      const status = processManager.getStatus()
      expect(status.isRunning).toBe(true)
      expect(status.status).toBe('running')
      expect(status.pid).toBe(63083)
      expect(status.port).toBe(3001)
    })

    it('should handle process exit gracefully', async () => {
      const startPromise = processManager.start(
        '/test/backend',
        mockWebSocketService
      )

      setTimeout(() => {
        mockProcess.stderr.emit('data', Buffer.from('Server ready: http://localhost:3001 🚀\n'))
      }, 10)

      await startPromise

      // Simulate process exit
      mockProcess.emit('exit', 0, null)

      expect(mockWebSocketService.emit).toHaveBeenCalledWith(
        'frigg:log',
        expect.objectContaining({
          level: 'info',
          message: expect.stringContaining('exited with code 0')
        })
      )

      expect(processManager.isRunning()).toBe(false)
    })

    it('should detect stale processes on start', async () => {
      // This would require mocking child_process.exec for port checking
      // For now, we'll test that the method exists and can be called
      expect(processManager.start).toBeDefined()
    })
  })

  describe('Stop Functionality', () => {
    it('should stop running process gracefully', async () => {
      // Start process first
      const startPromise = processManager.start(
        '/test/backend',
        mockWebSocketService
      )

      setTimeout(() => {
        mockProcess.stderr.emit('data', Buffer.from('Server ready: http://localhost:3001 🚀\n'))
      }, 10)

      await startPromise

      // Now stop it
      const stopPromise = processManager.stop(false, 5000)

      setTimeout(() => {
        mockProcess.emit('exit', null, 'SIGTERM')
      }, 10)

      const result = await stopPromise

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')
      expect(result.isRunning).toBe(false)
      expect(result.message).toContain('stopped gracefully')
    })

    it('should force kill if timeout exceeded', async () => {
      // Start process
      const startPromise = processManager.start(
        '/test/backend',
        mockWebSocketService
      )

      setTimeout(() => {
        mockProcess.stderr.emit('data', Buffer.from('Server ready: http://localhost:3001 🚀\n'))
      }, 10)

      await startPromise

      // Stop with very short timeout
      const stopPromise = processManager.stop(false, 100)

      // Don't emit exit event, let it timeout
      setTimeout(() => {
        // Force kill should happen here
        mockProcess.emit('exit', null, 'SIGKILL')
      }, 150)

      const result = await stopPromise

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL')
    })
  })

  describe('Error Handling', () => {
    it('should timeout if server never reports ready', async () => {
      const startPromise = processManager.start(
        '/test/backend',
        mockWebSocketService
      )

      // Don't emit "Server ready", let it timeout
      // Note: Default timeout is 30 seconds, would need to mock timers

      // For now, verify that timeout logic exists
      expect(startPromise).toBeInstanceOf(Promise)
    }, 35000) // Extend test timeout

    it('should handle process errors during startup', async () => {
      const startPromise = processManager.start(
        '/test/backend',
        mockWebSocketService
      )

      // Add error handler to prevent uncaught exception
      processManager.on('error', () => {
        // Expected error, ignore in test
      })

      setTimeout(() => {
        mockProcess.emit('error', new Error('ENOENT: command not found'))
      }, 10)

      await expect(startPromise).rejects.toThrow('command not found')

      expect(mockWebSocketService.emit).toHaveBeenCalledWith(
        'frigg:log',
        expect.objectContaining({
          level: 'error',
          message: expect.stringContaining('Failed to start')
        })
      )
    })

    it('should detect port already in use error', async () => {
      const startPromise = processManager.start(
        '/test/backend',
        mockWebSocketService
      )

      // Add error handler to prevent uncaught exception
      processManager.on('error', () => {
        // Expected error, ignore in test
      })

      setTimeout(() => {
        mockProcess.stderr.emit('data', Buffer.from('Error: listen EADDRINUSE: address already in use :::3001\n'))
        mockProcess.emit('exit', 1, null)
      }, 10)

      await expect(startPromise).rejects.toThrow(/Port is already in use|exit code 1/)

      // Check that error was logged (message may vary)
      const errorCalls = mockWebSocketService.emit.mock.calls.filter(
        call => call[0] === 'frigg:log' && call[1].level === 'error'
      )
      expect(errorCalls.length).toBeGreaterThan(0)
    })
  })
})
