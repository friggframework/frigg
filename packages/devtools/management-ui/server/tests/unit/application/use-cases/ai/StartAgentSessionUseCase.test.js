/**
 * StartAgentSessionUseCase Tests (TDD - RED Phase)
 *
 * Tests the use case for starting an AI agent session.
 * Following DDD patterns - use case orchestrates adapter calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StartAgentSessionUseCase } from '../../../../../src/application/use-cases/ai/StartAgentSessionUseCase.js'

describe('StartAgentSessionUseCase', () => {
  let useCase
  let mockClaudeAgentAdapter
  let mockWebSocketService

  beforeEach(() => {
    mockClaudeAgentAdapter = {
      startSession: vi.fn().mockResolvedValue(undefined)
    }

    mockWebSocketService = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn()
    }

    useCase = new StartAgentSessionUseCase({
      claudeAgentAdapter: mockClaudeAgentAdapter,
      webSocketService: mockWebSocketService
    })
  })

  describe('execute', () => {
    it('should throw error when sessionId is missing', async () => {
      await expect(useCase.execute({
        prompt: 'Test prompt',
        config: {}
      })).rejects.toThrow('Session ID is required')
    })

    it('should throw error when prompt is missing', async () => {
      await expect(useCase.execute({
        sessionId: 'test-session',
        config: {}
      })).rejects.toThrow('Prompt is required')
    })

    it('should throw error for non-claude-code provider', async () => {
      await expect(useCase.execute({
        sessionId: 'test-session',
        prompt: 'Test',
        config: { provider: 'openai' }
      })).rejects.toThrow('Only claude-code provider is supported')
    })

    it('should accept claude-code provider', async () => {
      const result = await useCase.execute({
        sessionId: 'test-session',
        prompt: 'Test',
        config: { provider: 'claude-code' },
        socketId: 'socket-123'
      })

      expect(result.status).toBe('started')
    })

    it('should call adapter with correct parameters', async () => {
      await useCase.execute({
        sessionId: 'test-session',
        prompt: 'Build an integration',
        config: {
          model: 'claude-opus-4-20250514',
          requireApproval: true,
          maxTurns: 30
        },
        socketId: 'socket-123'
      })

      expect(mockClaudeAgentAdapter.startSession).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'test-session',
          prompt: 'Build an integration',
          config: expect.objectContaining({
            model: 'claude-opus-4-20250514',
            requireApproval: true,
            maxTurns: 30
          })
        })
      )
    })

    it('should return started status', async () => {
      const result = await useCase.execute({
        sessionId: 'test-session',
        prompt: 'Test',
        config: {},
        socketId: 'socket-123'
      })

      expect(result).toEqual({
        sessionId: 'test-session',
        status: 'started',
        message: 'Agent session started'
      })
    })

    it('should pass onEvent callback that emits to WebSocket', async () => {
      await useCase.execute({
        sessionId: 'test-session',
        prompt: 'Test',
        config: {},
        socketId: 'socket-123'
      })

      // Get the onEvent callback that was passed to adapter
      const onEvent = mockClaudeAgentAdapter.startSession.mock.calls[0][0].onEvent

      // Simulate an event
      await onEvent({ type: 'content', content: 'Hello', sessionId: 'test-session' })

      expect(mockWebSocketService.to).toHaveBeenCalledWith('socket-123')
      expect(mockWebSocketService.emit).toHaveBeenCalledWith('agent:event', {
        type: 'content',
        content: 'Hello',
        sessionId: 'test-session'
      })
    })

    it('should default requireApproval to true', async () => {
      await useCase.execute({
        sessionId: 'test-session',
        prompt: 'Test',
        config: {},
        socketId: 'socket-123'
      })

      expect(mockClaudeAgentAdapter.startSession).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            requireApproval: true
          })
        })
      )
    })

    it('should not await adapter (runs in background)', async () => {
      // Make adapter take a long time
      mockClaudeAgentAdapter.startSession.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000))
      })

      const startTime = Date.now()
      await useCase.execute({
        sessionId: 'test-session',
        prompt: 'Test',
        config: {},
        socketId: 'socket-123'
      })
      const endTime = Date.now()

      // Should return immediately, not wait for the 1000ms
      expect(endTime - startTime).toBeLessThan(100)
    })
  })
})
