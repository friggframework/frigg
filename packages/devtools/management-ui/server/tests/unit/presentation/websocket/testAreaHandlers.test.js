/**
 * WebSocket Test Area Handlers Tests
 *
 * Tests the presentation layer WebSocket handlers for CLI prompt interaction.
 * Handles communication between Test Area UI and ProcessManager for
 * interactive pre-flight check prompts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupTestAreaHandlers } from '../../../../src/presentation/websocket/testAreaHandlers.js'

describe('testAreaHandlers', () => {
  let mockIo
  let mockSocket
  let mockProcessManager
  let socketHandlers

  beforeEach(() => {
    socketHandlers = {}

    mockSocket = {
      id: 'socket-test-123',
      on: vi.fn((event, handler) => {
        socketHandlers[event] = handler
      }),
      emit: vi.fn()
    }

    mockIo = {
      on: vi.fn((event, handler) => {
        if (event === 'connection') {
          handler(mockSocket)
        }
      })
    }

    mockProcessManager = {
      respondToPrompt: vi.fn().mockReturnValue(true),
      getPendingPrompts: vi.fn().mockReturnValue([]),
      on: vi.fn(),
      off: vi.fn()
    }

    setupTestAreaHandlers({
      io: mockIo,
      processManager: mockProcessManager
    })
  })

  describe('connection', () => {
    it('should register test area event handlers on connection', () => {
      expect(mockSocket.on).toHaveBeenCalledWith('frigg:prompt_response', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('frigg:prompts:pending', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function))
    })

    it('should register processManager event listeners', () => {
      expect(mockProcessManager.on).toHaveBeenCalledWith('frigg:prompt_request', expect.any(Function))
      expect(mockProcessManager.on).toHaveBeenCalledWith('frigg:prompt_response', expect.any(Function))
    })
  })

  describe('frigg:prompt_response', () => {
    it('should emit error when requestId is missing', () => {
      socketHandlers['frigg:prompt_response']({ response: true })

      expect(mockSocket.emit).toHaveBeenCalledWith('frigg:error', {
        error: { message: 'Request ID is required' }
      })
    })

    it('should emit error when response is missing', () => {
      socketHandlers['frigg:prompt_response']({ requestId: 'prompt-123' })

      expect(mockSocket.emit).toHaveBeenCalledWith('frigg:error', {
        requestId: 'prompt-123',
        error: { message: 'Response is required' }
      })
    })

    it('should call processManager.respondToPrompt with correct params', () => {
      socketHandlers['frigg:prompt_response']({
        requestId: 'prompt-123',
        response: true
      })

      expect(mockProcessManager.respondToPrompt).toHaveBeenCalledWith('prompt-123', true)
    })

    it('should emit frigg:prompt_response:ack on success', () => {
      mockProcessManager.respondToPrompt.mockReturnValue(true)

      socketHandlers['frigg:prompt_response']({
        requestId: 'prompt-123',
        response: false
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('frigg:prompt_response:ack', {
        requestId: 'prompt-123',
        status: 'delivered'
      })
    })

    it('should emit frigg:error when prompt not found', () => {
      mockProcessManager.respondToPrompt.mockReturnValue(false)

      socketHandlers['frigg:prompt_response']({
        requestId: 'unknown-prompt',
        response: true
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('frigg:error', {
        requestId: 'unknown-prompt',
        error: { message: 'Prompt not found or already expired' }
      })
    })

    it('should handle string responses for select prompts', () => {
      socketHandlers['frigg:prompt_response']({
        requestId: 'prompt-456',
        response: 'option_a'
      })

      expect(mockProcessManager.respondToPrompt).toHaveBeenCalledWith('prompt-456', 'option_a')
    })
  })

  describe('frigg:prompts:pending', () => {
    it('should call processManager.getPendingPrompts', () => {
      socketHandlers['frigg:prompts:pending']()

      expect(mockProcessManager.getPendingPrompts).toHaveBeenCalled()
    })

    it('should emit frigg:prompts:pending:response with empty array', () => {
      mockProcessManager.getPendingPrompts.mockReturnValue([])

      socketHandlers['frigg:prompts:pending']()

      expect(mockSocket.emit).toHaveBeenCalledWith('frigg:prompts:pending:response', {
        prompts: []
      })
    })

    it('should emit frigg:prompts:pending:response with pending prompts', () => {
      const pendingPrompts = [
        {
          requestId: 'prompt-1',
          prompt: { type: 'confirm', message: 'Start Docker?' },
          timestamp: 1000
        },
        {
          requestId: 'prompt-2',
          prompt: { type: 'select', message: 'Choose action?' },
          timestamp: 2000
        }
      ]
      mockProcessManager.getPendingPrompts.mockReturnValue(pendingPrompts)

      socketHandlers['frigg:prompts:pending']()

      expect(mockSocket.emit).toHaveBeenCalledWith('frigg:prompts:pending:response', {
        prompts: pendingPrompts
      })
    })
  })

  describe('processManager event forwarding', () => {
    it('should forward frigg:prompt_request events to socket', () => {
      // Get the registered handler for frigg:prompt_request
      const onCalls = mockProcessManager.on.mock.calls
      const promptRequestHandler = onCalls.find(call => call[0] === 'frigg:prompt_request')[1]

      // Call the handler as if ProcessManager emitted an event
      promptRequestHandler({
        requestId: 'prompt-new',
        prompt: {
          type: 'confirm',
          message: 'Start Docker Desktop?',
          default: true
        }
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('frigg:prompt_request', {
        requestId: 'prompt-new',
        prompt: {
          type: 'confirm',
          message: 'Start Docker Desktop?',
          default: true
        }
      })
    })

    it('should forward frigg:prompt_response events to socket', () => {
      // Get the registered handler for frigg:prompt_response
      const onCalls = mockProcessManager.on.mock.calls
      const promptResponseHandler = onCalls.find(call => call[0] === 'frigg:prompt_response')[1]

      // Call the handler as if ProcessManager emitted an event
      promptResponseHandler({
        requestId: 'prompt-answered',
        response: true
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('frigg:prompt_response', {
        requestId: 'prompt-answered',
        response: true
      })
    })
  })

  describe('disconnect', () => {
    it('should handle disconnect gracefully', () => {
      // Should not throw
      expect(() => socketHandlers['disconnect']()).not.toThrow()
    })

    it('should remove processManager event listeners on disconnect', () => {
      socketHandlers['disconnect']()

      // Should call off for both event types
      expect(mockProcessManager.off).toHaveBeenCalledWith('frigg:prompt_request', expect.any(Function))
      expect(mockProcessManager.off).toHaveBeenCalledWith('frigg:prompt_response', expect.any(Function))
    })
  })
})

describe('setupTestAreaHandlers return value', () => {
  it('should return the io instance', () => {
    const mockIo = {
      on: vi.fn()
    }
    const mockProcessManager = {
      on: vi.fn()
    }

    const result = setupTestAreaHandlers({
      io: mockIo,
      processManager: mockProcessManager
    })

    expect(result).toBe(mockIo)
  })
})
