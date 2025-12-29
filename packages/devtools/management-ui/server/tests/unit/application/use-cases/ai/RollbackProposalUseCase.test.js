/**
 * RollbackProposalUseCase Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RollbackProposalUseCase } from '../../../../../src/application/use-cases/ai/RollbackProposalUseCase.js'
import { Proposal } from '../../../../../src/domain/entities/Proposal.js'

describe('RollbackProposalUseCase', () => {
  let useCase
  let mockProposalRepository
  let mockFileSystemAdapter

  beforeEach(() => {
    mockProposalRepository = {
      findById: vi.fn(),
      save: vi.fn()
    }

    mockFileSystemAdapter = {
      deleteFile: vi.fn().mockResolvedValue({ path: '/test/file.js', deleted: true }),
      editFile: vi.fn().mockResolvedValue({ path: '/test/file.js', originalSize: 60, newSize: 50 })
    }

    useCase = new RollbackProposalUseCase({
      proposalRepository: mockProposalRepository,
      fileSystemAdapter: mockFileSystemAdapter
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
        toolArgs: {},
        status: 'approved'
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)

      await expect(useCase.execute({
        proposalId: 'p-1',
        sessionId: 'session-B'
      })).rejects.toThrow('Proposal does not belong to this session')
    })

    it('should throw error if proposal is still pending', async () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 'session-A',
        toolName: 'Write',
        toolArgs: {},
        status: 'pending'
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)

      await expect(useCase.execute({ proposalId: 'p-1' }))
        .rejects.toThrow('Cannot rollback proposal with status: pending')
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
        .rejects.toThrow('Cannot rollback proposal with status: rejected')
    })

    it('should throw error if proposal already rolled back', async () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 'session-A',
        toolName: 'Write',
        toolArgs: {},
        status: 'rolled_back'
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)

      await expect(useCase.execute({ proposalId: 'p-1' }))
        .rejects.toThrow('Cannot rollback proposal with status: rolled_back')
    })
  })

  describe('Write tool rollback', () => {
    it('should delete file and mark proposal as rolled_back', async () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 'session-A',
        toolName: 'Write',
        toolArgs: { file_path: '/test/new.js', content: 'const x = 1' },
        status: 'approved'
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)

      const result = await useCase.execute({
        proposalId: 'p-1',
        userId: 'user-123'
      })

      expect(mockFileSystemAdapter.deleteFile).toHaveBeenCalledWith('/test/new.js')
      expect(mockProposalRepository.save).toHaveBeenCalled()
      expect(result.proposal.status).toBe('rolled_back')
      expect(result.proposal.resolvedBy).toBe('user-123')
      expect(result.result.action).toBe('deleted')
      expect(result.result.filePath).toBe('/test/new.js')
    })
  })

  describe('Edit tool rollback', () => {
    it('should reverse edit and mark proposal as rolled_back', async () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 'session-A',
        toolName: 'Edit',
        toolArgs: {
          file_path: '/test/existing.js',
          old_string: 'const x = 1',
          new_string: 'const x = 2',
          replace_all: false
        },
        status: 'approved'
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)

      const result = await useCase.execute({ proposalId: 'p-1' })

      // Should swap old and new strings
      expect(mockFileSystemAdapter.editFile).toHaveBeenCalledWith(
        '/test/existing.js',
        'const x = 2', // new becomes old
        'const x = 1', // old becomes new
        false
      )
      expect(result.proposal.status).toBe('rolled_back')
      expect(result.result.action).toBe('reverted')
    })

    it('should preserve replace_all option', async () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 'session-A',
        toolName: 'Edit',
        toolArgs: {
          file_path: '/test/existing.js',
          old_string: 'foo',
          new_string: 'bar',
          replace_all: true
        },
        status: 'approved'
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)

      await useCase.execute({ proposalId: 'p-1' })

      expect(mockFileSystemAdapter.editFile).toHaveBeenCalledWith(
        '/test/existing.js',
        'bar',
        'foo',
        true
      )
    })
  })

  describe('unknown tool rollback', () => {
    it('should mark as rolled_back but warn about manual action needed', async () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 'session-A',
        toolName: 'Bash',
        toolArgs: { command: 'npm install' },
        status: 'approved'
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)

      const result = await useCase.execute({ proposalId: 'p-1' })

      expect(mockFileSystemAdapter.deleteFile).not.toHaveBeenCalled()
      expect(mockFileSystemAdapter.editFile).not.toHaveBeenCalled()
      expect(result.result.action).toBe('marked_rolled_back')
      expect(result.result.toolName).toBe('Bash')
      expect(result.result.warning).toContain('cannot be automatically reverted')
    })
  })

  describe('error handling', () => {
    it('should throw error if file operation fails', async () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 'session-A',
        toolName: 'Write',
        toolArgs: { file_path: '/test/new.js', content: 'test' },
        status: 'approved'
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)
      mockFileSystemAdapter.deleteFile.mockRejectedValue(new Error('File not found'))

      await expect(useCase.execute({ proposalId: 'p-1' }))
        .rejects.toThrow('Failed to rollback proposal: File not found')
    })
  })

  describe('session validation', () => {
    it('should allow rollback without session validation if sessionId not provided', async () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 'session-A',
        toolName: 'Write',
        toolArgs: { file_path: '/test/file.js', content: 'test' },
        status: 'approved'
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)

      const result = await useCase.execute({ proposalId: 'p-1' })

      expect(result.proposal.status).toBe('rolled_back')
    })
  })
})
