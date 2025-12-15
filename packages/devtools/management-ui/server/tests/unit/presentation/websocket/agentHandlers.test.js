/**
 * WebSocket Agent Handlers Tests
 *
 * Tests the presentation layer WebSocket handlers for AI agents.
 * Handlers should ONLY call use cases, not adapters directly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupAgentHandlers } from '../../../../src/presentation/websocket/agentHandlers.js'

describe('agentHandlers', () => {
  let mockIo
  let mockSocket
  let mockStartUseCase
  let mockStopUseCase
  let mockGetStatusUseCase
  let mockApproveUseCase
  let mockRejectUseCase
  let mockRollbackUseCase
  let mockAdapter
  let socketHandlers

  beforeEach(() => {
    socketHandlers = {}

    mockSocket = {
      id: 'socket-123',
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

    mockStartUseCase = {
      execute: vi.fn().mockResolvedValue({
        sessionId: 'test-session',
        status: 'started',
        message: 'Agent session started'
      })
    }

    mockStopUseCase = {
      execute: vi.fn().mockResolvedValue({
        sessionId: 'test-session',
        stopped: true,
        message: 'Session stopped'
      })
    }

    mockGetStatusUseCase = {
      execute: vi.fn().mockResolvedValue({
        sessionId: 'test-session',
        status: 'running',
        exists: true
      })
    }

    mockApproveUseCase = {
      execute: vi.fn().mockResolvedValue({
        proposal: {
          id: 'proposal-123',
          sessionId: 'test-session',
          toolName: 'Write',
          status: 'approved'
        },
        result: { action: 'created', filePath: '/test/file.js' }
      })
    }

    mockRejectUseCase = {
      execute: vi.fn().mockResolvedValue({
        proposal: {
          id: 'proposal-123',
          sessionId: 'test-session',
          toolName: 'Write',
          status: 'rejected'
        },
        reason: 'Not needed'
      })
    }

    mockRollbackUseCase = {
      execute: vi.fn().mockResolvedValue({
        proposal: {
          id: 'proposal-123',
          sessionId: 'test-session',
          toolName: 'Write',
          status: 'rolled_back'
        },
        result: { action: 'deleted', filePath: '/test/file.js' }
      })
    }

    mockAdapter = {
      getAvailableRoles: vi.fn().mockReturnValue({
        standard: ['coder', 'reviewer'],
        adversarial: ['securityAuditor']
      }),
      checkAvailability: vi.fn().mockResolvedValue({
        available: true,
        version: '1.0.0'
      })
    }

    setupAgentHandlers({
      io: mockIo,
      startAgentSessionUseCase: mockStartUseCase,
      stopAgentSessionUseCase: mockStopUseCase,
      getAgentSessionStatusUseCase: mockGetStatusUseCase,
      claudeAgentAdapter: mockAdapter,
      approveProposalUseCase: mockApproveUseCase,
      rejectProposalUseCase: mockRejectUseCase,
      rollbackProposalUseCase: mockRollbackUseCase
    })
  })

  describe('connection', () => {
    it('should register all agent event handlers on connection', () => {
      expect(mockSocket.on).toHaveBeenCalledWith('agent:start', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('agent:stop', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('agent:status', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('agent:roles', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('agent:approve', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('agent:reject', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('agent:rollback', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function))
    })
  })

  describe('agent:start', () => {
    it('should emit error when sessionId is missing', async () => {
      await socketHandlers['agent:start']({ prompt: 'Test' })

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:error', {
        sessionId: undefined,
        error: { message: 'Session ID and prompt are required' }
      })
    })

    it('should emit error when prompt is missing', async () => {
      await socketHandlers['agent:start']({ sessionId: 'test' })

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:error', {
        sessionId: 'test',
        error: { message: 'Session ID and prompt are required' }
      })
    })

    it('should emit error for non-claude-code provider', async () => {
      await socketHandlers['agent:start']({
        sessionId: 'test',
        prompt: 'Test',
        config: { provider: 'openai' }
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:error', {
        sessionId: 'test',
        error: { message: 'Only claude-code provider is supported' }
      })
    })

    it('should call startAgentSessionUseCase with correct params', async () => {
      await socketHandlers['agent:start']({
        sessionId: 'test-session',
        prompt: 'Build integration',
        config: { model: 'claude-opus-4-20250514' }
      })

      expect(mockStartUseCase.execute).toHaveBeenCalledWith({
        sessionId: 'test-session',
        prompt: 'Build integration',
        config: { model: 'claude-opus-4-20250514' },
        socketId: 'socket-123'
      })
    })

    it('should emit agent:started on success', async () => {
      await socketHandlers['agent:start']({
        sessionId: 'test-session',
        prompt: 'Test',
        config: {}
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:started', {
        sessionId: 'test-session'
      })
    })

    it('should emit agent:error on use case failure', async () => {
      mockStartUseCase.execute.mockRejectedValue(new Error('Use case error'))

      await socketHandlers['agent:start']({
        sessionId: 'test-session',
        prompt: 'Test',
        config: {}
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:error', {
        sessionId: 'test-session',
        error: { message: 'Use case error' }
      })
    })
  })

  describe('agent:stop', () => {
    it('should emit error when sessionId is missing', async () => {
      await socketHandlers['agent:stop']({})

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:error', {
        error: { message: 'Session ID is required' }
      })
    })

    it('should call stopAgentSessionUseCase', async () => {
      await socketHandlers['agent:stop']({ sessionId: 'test-session' })

      expect(mockStopUseCase.execute).toHaveBeenCalledWith({
        sessionId: 'test-session'
      })
    })

    it('should emit agent:stopped with result', async () => {
      await socketHandlers['agent:stop']({ sessionId: 'test-session' })

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:stopped', {
        sessionId: 'test-session',
        stopped: true,
        message: 'Session stopped'
      })
    })
  })

  describe('agent:status', () => {
    it('should check availability when sessionId is missing', async () => {
      await socketHandlers['agent:status']({ provider: 'claude-code' })

      expect(mockAdapter.checkAvailability).toHaveBeenCalledWith('claude-code')
    })

    it('should emit agent:status:response with availability result', async () => {
      await socketHandlers['agent:status']({ provider: 'claude-code' })

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:status:response', {
        available: true,
        error: null,
        provider: 'claude-code'
      })
    })

    it('should call getAgentSessionStatusUseCase when sessionId provided', async () => {
      await socketHandlers['agent:status']({ sessionId: 'test-session' })

      expect(mockGetStatusUseCase.execute).toHaveBeenCalledWith({
        sessionId: 'test-session'
      })
    })

    it('should emit agent:status:response with session status', async () => {
      await socketHandlers['agent:status']({ sessionId: 'test-session' })

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:status:response', {
        sessionId: 'test-session',
        status: 'running',
        exists: true
      })
    })
  })

  describe('agent:roles', () => {
    it('should call adapter getAvailableRoles', () => {
      socketHandlers['agent:roles']()

      expect(mockAdapter.getAvailableRoles).toHaveBeenCalled()
    })

    it('should emit agent:roles:response with roles', () => {
      socketHandlers['agent:roles']()

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:roles:response', {
        standard: ['coder', 'reviewer'],
        adversarial: ['securityAuditor']
      })
    })
  })

  describe('agent:approve', () => {
    it('should emit error when proposalId is missing', async () => {
      await socketHandlers['agent:approve']({
        sessionId: 'test-session'
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:error', {
        sessionId: 'test-session',
        error: { message: 'Proposal ID is required' }
      })
    })

    it('should call approveProposalUseCase with correct params', async () => {
      await socketHandlers['agent:approve']({
        sessionId: 'test-session',
        proposalId: 'proposal-123',
        userId: 'user-1'
      })

      expect(mockApproveUseCase.execute).toHaveBeenCalledWith({
        proposalId: 'proposal-123',
        sessionId: 'test-session',
        userId: 'user-1'
      })
    })

    it('should emit agent:approved on success', async () => {
      await socketHandlers['agent:approve']({
        sessionId: 'test-session',
        proposalId: 'proposal-123'
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:approved', {
        sessionId: 'test-session',
        proposalId: 'proposal-123',
        proposal: {
          id: 'proposal-123',
          sessionId: 'test-session',
          toolName: 'Write',
          status: 'approved'
        },
        result: { action: 'created', filePath: '/test/file.js' }
      })
    })

    it('should emit agent:error on use case failure', async () => {
      mockApproveUseCase.execute.mockRejectedValue(new Error('Proposal not found'))

      await socketHandlers['agent:approve']({
        sessionId: 'test-session',
        proposalId: 'nonexistent'
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:error', {
        sessionId: 'test-session',
        proposalId: 'nonexistent',
        error: { message: 'Proposal not found' }
      })
    })
  })

  describe('agent:reject', () => {
    it('should emit error when proposalId is missing', async () => {
      await socketHandlers['agent:reject']({
        sessionId: 'test-session'
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:error', {
        sessionId: 'test-session',
        error: { message: 'Proposal ID is required' }
      })
    })

    it('should call rejectProposalUseCase with correct params', async () => {
      await socketHandlers['agent:reject']({
        sessionId: 'test-session',
        proposalId: 'proposal-123',
        userId: 'user-1',
        reason: 'Not needed'
      })

      expect(mockRejectUseCase.execute).toHaveBeenCalledWith({
        proposalId: 'proposal-123',
        sessionId: 'test-session',
        userId: 'user-1',
        reason: 'Not needed'
      })
    })

    it('should emit agent:rejected on success', async () => {
      await socketHandlers['agent:reject']({
        sessionId: 'test-session',
        proposalId: 'proposal-123'
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:rejected', {
        sessionId: 'test-session',
        proposalId: 'proposal-123',
        proposal: {
          id: 'proposal-123',
          sessionId: 'test-session',
          toolName: 'Write',
          status: 'rejected'
        },
        reason: 'Not needed'
      })
    })

    it('should emit agent:error on use case failure', async () => {
      mockRejectUseCase.execute.mockRejectedValue(new Error('Proposal not found'))

      await socketHandlers['agent:reject']({
        sessionId: 'test-session',
        proposalId: 'nonexistent'
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:error', {
        sessionId: 'test-session',
        proposalId: 'nonexistent',
        error: { message: 'Proposal not found' }
      })
    })
  })

  describe('agent:rollback', () => {
    it('should emit error when proposalId is missing', async () => {
      await socketHandlers['agent:rollback']({
        sessionId: 'test-session'
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:error', {
        sessionId: 'test-session',
        error: { message: 'Proposal ID is required' }
      })
    })

    it('should call rollbackProposalUseCase with correct params', async () => {
      await socketHandlers['agent:rollback']({
        sessionId: 'test-session',
        proposalId: 'proposal-123',
        userId: 'user-1'
      })

      expect(mockRollbackUseCase.execute).toHaveBeenCalledWith({
        proposalId: 'proposal-123',
        sessionId: 'test-session',
        userId: 'user-1'
      })
    })

    it('should emit agent:rollback:response on success', async () => {
      await socketHandlers['agent:rollback']({
        sessionId: 'test-session',
        proposalId: 'proposal-123'
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:rollback:response', {
        sessionId: 'test-session',
        proposalId: 'proposal-123',
        proposal: {
          id: 'proposal-123',
          sessionId: 'test-session',
          toolName: 'Write',
          status: 'rolled_back'
        },
        result: { action: 'deleted', filePath: '/test/file.js' }
      })
    })

    it('should emit agent:error on use case failure', async () => {
      mockRollbackUseCase.execute.mockRejectedValue(new Error('Cannot rollback'))

      await socketHandlers['agent:rollback']({
        sessionId: 'test-session',
        proposalId: 'proposal-123'
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:error', {
        sessionId: 'test-session',
        proposalId: 'proposal-123',
        error: { message: 'Cannot rollback' }
      })
    })
  })
})
