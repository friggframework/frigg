/**
 * Unit tests for ProcessManager
 * Domain Layer - Process lifecycle management
 *
 * NOTE: The ProcessManager tests are limited to pure functions and state management
 * because the class uses real child_process.spawn which is difficult to mock in ESM.
 * Integration tests should be used for full process lifecycle testing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// We can't properly mock spawn in ESM, so we test what we can without starting processes
// Import the class directly and test its state management
import { ProcessManager } from '../../../src/domain/services/ProcessManager.js'

describe('ProcessManager', () => {
  let processManager

  beforeEach(() => {
    vi.clearAllMocks()
    processManager = new ProcessManager()
  })

  describe('Constructor and Initial State', () => {
    it('should initialize with null process', () => {
      expect(processManager.process).toBeNull()
    })

    it('should initialize with null pid', () => {
      expect(processManager.pid).toBeNull()
    })

    it('should initialize with null port', () => {
      expect(processManager.port).toBeNull()
    })

    it('should initialize with null startTime', () => {
      expect(processManager.startTime).toBeNull()
    })

    it('should initialize with null repositoryPath', () => {
      expect(processManager.repositoryPath).toBeNull()
    })

    it('should initialize with isStarting as false', () => {
      expect(processManager.isStarting).toBe(false)
    })

    it('should be an EventEmitter', () => {
      expect(typeof processManager.on).toBe('function')
      expect(typeof processManager.emit).toBe('function')
    })
  })

  describe('isRunning()', () => {
    it('should return false when process is null', () => {
      expect(processManager.isRunning()).toBe(false)
    })

    it('should return false when process is killed', () => {
      processManager.process = { killed: true }
      expect(processManager.isRunning()).toBe(false)
    })

    it('should return true when process exists and is not killed', () => {
      processManager.process = { killed: false }
      expect(processManager.isRunning()).toBe(true)
    })
  })

  describe('getStatus()', () => {
    it('should return stopped status when not running', () => {
      const status = processManager.getStatus()

      expect(status).toEqual({
        isRunning: false,
        status: 'stopped'
      })
    })

    it('should return running status with all details when running', () => {
      // Simulate a running state
      processManager.process = { killed: false }
      processManager.pid = 12345
      processManager.port = 3001
      processManager.startTime = new Date('2025-01-01T00:00:00Z')
      processManager.repositoryPath = '/test/path'

      const status = processManager.getStatus()

      expect(status.isRunning).toBe(true)
      expect(status.status).toBe('running')
      expect(status.pid).toBe(12345)
      expect(status.port).toBe(3001)
      expect(status.baseUrl).toBe('http://localhost:3001')
      expect(status.startTime).toBe('2025-01-01T00:00:00.000Z')
      expect(status.repositoryPath).toBe('/test/path')
      expect(typeof status.uptime).toBe('number')
      expect(status.uptime).toBeGreaterThanOrEqual(0)
    })

    it('should return null baseUrl when port is not set', () => {
      processManager.process = { killed: false }
      processManager.pid = 12345
      processManager.port = null

      const status = processManager.getStatus()

      expect(status.baseUrl).toBeNull()
    })
  })

  describe('cleanup()', () => {
    it('should reset all state properties', () => {
      // Set up some state
      processManager.process = { killed: false }
      processManager.pid = 12345
      processManager.port = 3001
      processManager.startTime = new Date()
      processManager.repositoryPath = '/test/path'
      processManager.isStarting = true

      // Call cleanup
      processManager.cleanup()

      // Verify all state is reset
      expect(processManager.process).toBeNull()
      expect(processManager.pid).toBeNull()
      expect(processManager.port).toBeNull()
      expect(processManager.startTime).toBeNull()
      expect(processManager.repositoryPath).toBeNull()
      expect(processManager.isStarting).toBe(false)
    })
  })

  describe('stop() without running process', () => {
    it('should return not running message when no process', async () => {
      const result = await processManager.stop()

      expect(result).toEqual({
        isRunning: false,
        message: 'No Frigg process is running'
      })
    })

    it('should return not running message when process is killed', async () => {
      processManager.process = { killed: true }

      const result = await processManager.stop()

      expect(result).toEqual({
        isRunning: false,
        message: 'No Frigg process is running'
      })
    })
  })

  describe('findBackendPath()', () => {
    // Note: This test requires fs.existsSync which we're not mocking
    // Testing the logic flow only
    it('should be a function', () => {
      expect(typeof processManager.findBackendPath).toBe('function')
    })

    it('should accept a path parameter', () => {
      // The actual result depends on filesystem, just verify it runs
      expect(() => processManager.findBackendPath('/some/path')).not.toThrow()
    })
  })

  describe('Event Emission', () => {
    it('should emit events when registered', () => {
      const callback = vi.fn()
      processManager.on('test-event', callback)

      processManager.emit('test-event', { data: 'test' })

      expect(callback).toHaveBeenCalledWith({ data: 'test' })
    })

    it('should support error events', () => {
      const errorCallback = vi.fn()
      processManager.on('error', errorCallback)

      const testError = new Error('Test error')
      processManager.emit('error', testError)

      expect(errorCallback).toHaveBeenCalledWith(testError)
    })

    it('should support log events', () => {
      const logCallback = vi.fn()
      processManager.on('log', logCallback)

      const logData = { level: 'info', message: 'Test log' }
      processManager.emit('log', logData)

      expect(logCallback).toHaveBeenCalledWith(logData)
    })

    it('should support exit events', () => {
      const exitCallback = vi.fn()
      processManager.on('exit', exitCallback)

      processManager.emit('exit', { code: 0, signal: null })

      expect(exitCallback).toHaveBeenCalledWith({ code: 0, signal: null })
    })
  })

  describe('IPC Mode - Initial State', () => {
    it('should initialize ipcMode as false', () => {
      expect(processManager.ipcMode).toBe(false)
    })

    it('should initialize pendingPrompts as empty Map', () => {
      expect(processManager.pendingPrompts).toBeInstanceOf(Map)
      expect(processManager.pendingPrompts.size).toBe(0)
    })
  })

  describe('IPC Mode - _parseIpcMessage()', () => {
    it('should parse valid prompt_request IPC message', () => {
      const ipcMessage = JSON.stringify({
        frigg_ipc: 'prompt_request',
        requestId: 'prompt-1234',
        prompt: {
          type: 'confirm',
          message: 'Start Docker Desktop?',
          default: true
        }
      })

      const result = processManager._parseIpcMessage(ipcMessage)

      expect(result).not.toBeNull()
      expect(result.type).toBe('prompt_request')
      expect(result.requestId).toBe('prompt-1234')
      expect(result.prompt.type).toBe('confirm')
      expect(result.prompt.message).toBe('Start Docker Desktop?')
      expect(result.prompt.default).toBe(true)
    })

    it('should parse valid log IPC message', () => {
      const ipcMessage = JSON.stringify({
        frigg_ipc: 'log',
        level: 'info',
        message: 'Starting pre-flight checks...'
      })

      const result = processManager._parseIpcMessage(ipcMessage)

      expect(result).not.toBeNull()
      expect(result.type).toBe('log')
      expect(result.level).toBe('info')
      expect(result.message).toBe('Starting pre-flight checks...')
    })

    it('should return null for non-IPC JSON messages', () => {
      const regularJson = JSON.stringify({ foo: 'bar', baz: 123 })

      const result = processManager._parseIpcMessage(regularJson)

      expect(result).toBeNull()
    })

    it('should return null for non-JSON messages', () => {
      const regularLog = 'Starting server...'

      const result = processManager._parseIpcMessage(regularLog)

      expect(result).toBeNull()
    })

    it('should return null for invalid JSON', () => {
      const invalidJson = '{ invalid json }'

      const result = processManager._parseIpcMessage(invalidJson)

      expect(result).toBeNull()
    })

    it('should return null for empty string', () => {
      const result = processManager._parseIpcMessage('')

      expect(result).toBeNull()
    })

    it('should handle JSON with newline at end', () => {
      const ipcMessage = JSON.stringify({
        frigg_ipc: 'prompt_request',
        requestId: 'prompt-5678',
        prompt: { type: 'confirm', message: 'Continue?' }
      }) + '\n'

      const result = processManager._parseIpcMessage(ipcMessage)

      expect(result).not.toBeNull()
      expect(result.requestId).toBe('prompt-5678')
    })
  })

  describe('IPC Mode - _handleIpcPrompt()', () => {
    it('should store prompt in pendingPrompts Map', () => {
      const prompt = {
        type: 'prompt_request',
        requestId: 'prompt-1234',
        prompt: {
          type: 'confirm',
          message: 'Start Docker?',
          default: true
        }
      }

      processManager._handleIpcPrompt(prompt)

      expect(processManager.pendingPrompts.has('prompt-1234')).toBe(true)
      const stored = processManager.pendingPrompts.get('prompt-1234')
      expect(stored.prompt).toEqual(prompt.prompt)
      expect(stored.timestamp).toBeDefined()
    })

    it('should emit frigg:prompt_request event', () => {
      const promptCallback = vi.fn()
      processManager.on('frigg:prompt_request', promptCallback)

      const prompt = {
        type: 'prompt_request',
        requestId: 'prompt-5678',
        prompt: {
          type: 'select',
          message: 'Choose action:',
          choices: [{ value: 'a', name: 'Option A' }]
        }
      }

      processManager._handleIpcPrompt(prompt)

      expect(promptCallback).toHaveBeenCalledWith({
        requestId: 'prompt-5678',
        prompt: prompt.prompt
      })
    })
  })

  describe('IPC Mode - respondToPrompt()', () => {
    it('should return false if no process is running', () => {
      processManager.process = null

      const result = processManager.respondToPrompt('prompt-1234', true)

      expect(result).toBe(false)
    })

    it('should return false if prompt requestId not in pendingPrompts', () => {
      processManager.process = { stdin: { write: vi.fn() } }

      const result = processManager.respondToPrompt('unknown-id', true)

      expect(result).toBe(false)
    })

    it('should write JSON response to process stdin', () => {
      const mockWrite = vi.fn()
      processManager.process = { stdin: { write: mockWrite } }
      processManager.pendingPrompts.set('prompt-1234', {
        prompt: { type: 'confirm', message: 'Test?' },
        timestamp: Date.now()
      })

      const result = processManager.respondToPrompt('prompt-1234', true)

      expect(result).toBe(true)
      expect(mockWrite).toHaveBeenCalled()

      // Verify the written JSON format
      const writtenData = mockWrite.mock.calls[0][0]
      const parsed = JSON.parse(writtenData.trim())
      expect(parsed.frigg_ipc).toBe('prompt_response')
      expect(parsed.requestId).toBe('prompt-1234')
      expect(parsed.response).toBe(true)
    })

    it('should remove prompt from pendingPrompts after responding', () => {
      const mockWrite = vi.fn()
      processManager.process = { stdin: { write: mockWrite } }
      processManager.pendingPrompts.set('prompt-1234', {
        prompt: { type: 'confirm', message: 'Test?' },
        timestamp: Date.now()
      })

      processManager.respondToPrompt('prompt-1234', 'selected_option')

      expect(processManager.pendingPrompts.has('prompt-1234')).toBe(false)
    })

    it('should emit frigg:prompt_response event', () => {
      const responseCallback = vi.fn()
      processManager.on('frigg:prompt_response', responseCallback)

      const mockWrite = vi.fn()
      processManager.process = { stdin: { write: mockWrite } }
      processManager.pendingPrompts.set('prompt-1234', {
        prompt: { type: 'confirm', message: 'Test?' },
        timestamp: Date.now()
      })

      processManager.respondToPrompt('prompt-1234', false)

      expect(responseCallback).toHaveBeenCalledWith({
        requestId: 'prompt-1234',
        response: false
      })
    })
  })

  describe('IPC Mode - getPendingPrompts()', () => {
    it('should return empty array when no pending prompts', () => {
      const result = processManager.getPendingPrompts()

      expect(result).toEqual([])
    })

    it('should return array of pending prompts with requestIds', () => {
      processManager.pendingPrompts.set('prompt-1', {
        prompt: { type: 'confirm', message: 'Prompt 1?' },
        timestamp: 1000
      })
      processManager.pendingPrompts.set('prompt-2', {
        prompt: { type: 'select', message: 'Prompt 2?' },
        timestamp: 2000
      })

      const result = processManager.getPendingPrompts()

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        requestId: 'prompt-1',
        prompt: { type: 'confirm', message: 'Prompt 1?' },
        timestamp: 1000
      })
      expect(result[1]).toEqual({
        requestId: 'prompt-2',
        prompt: { type: 'select', message: 'Prompt 2?' },
        timestamp: 2000
      })
    })
  })

  describe('IPC Mode - cleanup includes pendingPrompts', () => {
    it('should clear pendingPrompts on cleanup', () => {
      processManager.pendingPrompts.set('prompt-1', { prompt: {}, timestamp: 1000 })
      processManager.pendingPrompts.set('prompt-2', { prompt: {}, timestamp: 2000 })
      processManager.ipcMode = true

      processManager.cleanup()

      expect(processManager.pendingPrompts.size).toBe(0)
      expect(processManager.ipcMode).toBe(false)
    })
  })

  describe('IPC Mode - enableIpcMode()', () => {
    it('should set ipcMode to true', () => {
      processManager.enableIpcMode()

      expect(processManager.ipcMode).toBe(true)
    })
  })
})
