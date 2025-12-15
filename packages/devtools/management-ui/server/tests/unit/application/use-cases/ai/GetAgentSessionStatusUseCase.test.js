/**
 * GetAgentSessionStatusUseCase Tests (TDD - RED Phase)
 *
 * Tests the use case for getting AI agent session status.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GetAgentSessionStatusUseCase } from '../../../../../src/application/use-cases/ai/GetAgentSessionStatusUseCase.js'

describe('GetAgentSessionStatusUseCase', () => {
  let useCase
  let mockClaudeAgentAdapter

  beforeEach(() => {
    mockClaudeAgentAdapter = {
      getSessionStatus: vi.fn()
    }

    useCase = new GetAgentSessionStatusUseCase({
      claudeAgentAdapter: mockClaudeAgentAdapter
    })
  })

  describe('execute', () => {
    it('should throw error when sessionId is missing', async () => {
      await expect(useCase.execute({})).rejects.toThrow('Session ID is required')
    })

    it('should call adapter getSessionStatus with sessionId', async () => {
      mockClaudeAgentAdapter.getSessionStatus.mockReturnValue({
        sessionId: 'test-session',
        status: 'running',
        startedAt: Date.now()
      })

      await useCase.execute({ sessionId: 'test-session' })

      expect(mockClaudeAgentAdapter.getSessionStatus).toHaveBeenCalledWith('test-session')
    })

    it('should return exists false when session not found', async () => {
      mockClaudeAgentAdapter.getSessionStatus.mockReturnValue(null)

      const result = await useCase.execute({ sessionId: 'non-existent' })

      expect(result).toEqual({
        sessionId: 'non-existent',
        exists: false,
        message: 'Session not found'
      })
    })

    it('should return session status with exists true when found', async () => {
      const mockStatus = {
        sessionId: 'test-session',
        status: 'running',
        role: 'coder',
        startedAt: 1234567890,
        duration: 5000
      }
      mockClaudeAgentAdapter.getSessionStatus.mockReturnValue(mockStatus)

      const result = await useCase.execute({ sessionId: 'test-session' })

      expect(result).toEqual({
        ...mockStatus,
        exists: true
      })
    })
  })
})
