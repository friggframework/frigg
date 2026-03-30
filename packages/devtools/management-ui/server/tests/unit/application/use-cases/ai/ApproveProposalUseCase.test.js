/**
 * ApproveProposalUseCase Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ApproveProposalUseCase } from '../../../../../src/application/use-cases/ai/ApproveProposalUseCase.js'
import { Proposal } from '../../../../../src/domain/entities/Proposal.js'

describe('ApproveProposalUseCase', () => {
  let useCase
  let mockProposalRepository
  let mockFileSystemAdapter

  beforeEach(() => {
    mockProposalRepository = {
      findById: vi.fn(),
      save: vi.fn()
    }

    mockFileSystemAdapter = {
      writeFile: vi.fn().mockResolvedValue({ path: '/test/file.js', size: 100 }),
      editFile: vi.fn().mockResolvedValue({ path: '/test/file.js', originalSize: 50, newSize: 60 })
    }

    useCase = new ApproveProposalUseCase({
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
        toolArgs: {}
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)

      await expect(useCase.execute({
        proposalId: 'p-1',
        sessionId: 'session-B'
      })).rejects.toThrow('Proposal does not belong to this session')
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
        .rejects.toThrow('Cannot approve proposal with status: approved')
    })
  })

  describe('Write tool approval', () => {
    it('should write file and mark proposal as approved', async () => {
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

      expect(mockFileSystemAdapter.writeFile).toHaveBeenCalledWith(
        '/test/new.js',
        'const x = 1'
      )
      expect(mockProposalRepository.save).toHaveBeenCalled()
      expect(result.proposal.status).toBe('approved')
      expect(result.proposal.resolvedBy).toBe('user-123')
      expect(result.result.action).toBe('created')
      expect(result.result.filePath).toBe('/test/new.js')
    })
  })

  describe('Edit tool approval', () => {
    it('should edit file and mark proposal as approved', async () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 'session-A',
        toolName: 'Edit',
        toolArgs: {
          file_path: '/test/existing.js',
          old_string: 'const x = 1',
          new_string: 'const x = 2',
          replace_all: false
        }
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)

      const result = await useCase.execute({ proposalId: 'p-1' })

      expect(mockFileSystemAdapter.editFile).toHaveBeenCalledWith(
        '/test/existing.js',
        'const x = 1',
        'const x = 2',
        false
      )
      expect(result.proposal.status).toBe('approved')
      expect(result.result.action).toBe('edited')
    })

    it('should handle replace_all option', async () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 'session-A',
        toolName: 'Edit',
        toolArgs: {
          file_path: '/test/existing.js',
          old_string: 'foo',
          new_string: 'bar',
          replace_all: true
        }
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)

      await useCase.execute({ proposalId: 'p-1' })

      expect(mockFileSystemAdapter.editFile).toHaveBeenCalledWith(
        '/test/existing.js',
        'foo',
        'bar',
        true
      )
    })
  })

  describe('unknown tool approval', () => {
    it('should acknowledge but not execute unknown tools', async () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 'session-A',
        toolName: 'Bash',
        toolArgs: { command: 'npm install' }
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)

      const result = await useCase.execute({ proposalId: 'p-1' })

      expect(mockFileSystemAdapter.writeFile).not.toHaveBeenCalled()
      expect(mockFileSystemAdapter.editFile).not.toHaveBeenCalled()
      expect(result.result.action).toBe('acknowledged')
      expect(result.result.toolName).toBe('Bash')
    })
  })

  describe('error handling', () => {
    it('should throw error if file operation fails', async () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 'session-A',
        toolName: 'Write',
        toolArgs: { file_path: '/test/new.js', content: 'test' }
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)
      mockFileSystemAdapter.writeFile.mockRejectedValue(new Error('Permission denied'))

      await expect(useCase.execute({ proposalId: 'p-1' }))
        .rejects.toThrow('Failed to apply proposal: Permission denied')
    })
  })

  describe('session validation', () => {
    it('should allow approval without session validation if sessionId not provided', async () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 'session-A',
        toolName: 'Write',
        toolArgs: { file_path: '/test/new.js', content: 'test' }
      })
      mockProposalRepository.findById.mockResolvedValue(proposal)

      const result = await useCase.execute({ proposalId: 'p-1' })

      expect(result.proposal.status).toBe('approved')
    })
  })
})
