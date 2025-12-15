/**
 * RejectProposalUseCase Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RejectProposalUseCase } from '../../../../../src/application/use-cases/ai/RejectProposalUseCase.js'
import { Proposal } from '../../../../../src/domain/entities/Proposal.js'

describe('RejectProposalUseCase', () => {
  let useCase
  let mockProposalRepository

  beforeEach(() => {
    mockProposalRepository = {
      findById: vi.fn(),
      save: vi.fn()
    }

    useCase = new RejectProposalUseCase({
      proposalRepository: mockProposalRepository
    })
  })

  describe('validation', () => {
    it('should throw error if proposalId is missing', async () => {
      await expect(useCase.execute({})).rejects.toThrow('Proposal ID is required')
    })

    it('should throw error if proposal not found', async () => {
      mockProposalRepository.findById.mockResolvedValue(null)

      await expect(useCase.execute({ proposalId: 'not-found' }))
        .rejects.toThrow('Proposal not found: not-found')
    })

    it('should throw error if proposal belongs to different session', async () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 'session-A',
        toolName: 'Write',
        toolArgs: {}
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)

      await expect(useCase.execute({
        proposalId: 'p-1',
        sessionId: 'session-B'
      })).rejects.toThrow('Proposal does not belong to this session')
    })

    it('should throw error if proposal already rejected', async () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 'session-A',
        toolName: 'Write',
        toolArgs: {},
        status: 'rejected'
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)

      await expect(useCase.execute({ proposalId: 'p-1' }))
        .rejects.toThrow('Cannot reject proposal with status: rejected')
    })

    it('should throw error if proposal already approved', async () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 'session-A',
        toolName: 'Write',
        toolArgs: {},
        status: 'approved'
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)

      await expect(useCase.execute({ proposalId: 'p-1' }))
        .rejects.toThrow('Cannot reject proposal with status: approved')
    })
  })

  describe('rejection', () => {
    it('should mark proposal as rejected', async () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 'session-A',
        toolName: 'Write',
        toolArgs: { file_path: '/test/new.js', content: 'const x = 1' }
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)

      const result = await useCase.execute({
        proposalId: 'p-1',
        userId: 'user-123'
      })

      expect(mockProposalRepository.save).toHaveBeenCalled()
      expect(result.proposal.status).toBe('rejected')
      expect(result.proposal.resolvedBy).toBe('user-123')
    })

    it('should include rejection reason', async () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 'session-A',
        toolName: 'Write',
        toolArgs: {}
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)

      const result = await useCase.execute({
        proposalId: 'p-1',
        reason: 'Changes not needed'
      })

      expect(result.reason).toBe('Changes not needed')
    })

    it('should use default userId if not provided', async () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 'session-A',
        toolName: 'Write',
        toolArgs: {}
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)

      const result = await useCase.execute({ proposalId: 'p-1' })

      expect(result.proposal.resolvedBy).toBe('user')
    })
  })

  describe('session validation', () => {
    it('should allow rejection without session validation if sessionId not provided', async () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 'session-A',
        toolName: 'Write',
        toolArgs: {}
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)

      const result = await useCase.execute({ proposalId: 'p-1' })

      expect(result.proposal.status).toBe('rejected')
    })
  })
})
