/**
 * StopAgentSessionUseCase Tests (TDD - RED Phase)
 *
 * Tests the use case for stopping an AI agent session.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StopAgentSessionUseCase } from '../../../../../src/application/use-cases/ai/StopAgentSessionUseCase.js'

describe('StopAgentSessionUseCase', () => {
  let useCase
  let mockClaudeAgentAdapter

  beforeEach(() => {
    mockClaudeAgentAdapter = {
      stopSession: vi.fn()
    }

    useCase = new StopAgentSessionUseCase({
      claudeAgentAdapter: mockClaudeAgentAdapter
    })
  })

  describe('execute', () => {
    it('should throw error when sessionId is missing', async () => {
      await expect(useCase.execute({})).rejects.toThrow('Session ID is required')
    })

    it('should call adapter stopSession with sessionId', async () => {
      mockClaudeAgentAdapter.stopSession.mockResolvedValue(true)

      await useCase.execute({ sessionId: 'test-session' })

      expect(mockClaudeAgentAdapter.stopSession).toHaveBeenCalledWith('test-session')
    })

    it('should return stopped true when session was active', async () => {
      mockClaudeAgentAdapter.stopSession.mockResolvedValue(true)

      const result = await useCase.execute({ sessionId: 'test-session' })

      expect(result).toEqual({
        sessionId: 'test-session',
        stopped: true,
        message: 'Session stopped'
      })
    })

    it('should return stopped false when session was not found', async () => {
      mockClaudeAgentAdapter.stopSession.mockResolvedValue(false)

      const result = await useCase.execute({ sessionId: 'non-existent' })

      expect(result).toEqual({
        sessionId: 'non-existent',
        stopped: false,
        message: 'Session not found or already stopped'
      })
    })
  })
})
