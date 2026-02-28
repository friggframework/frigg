/**
 * OpenInIDEUseCase Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OpenInIDEUseCase } from '../../../../../src/application/use-cases/ide/OpenInIDEUseCase.js'

describe('OpenInIDEUseCase', () => {
  let useCase
  let mockIDERepository
  let mockGitAdapter

  beforeEach(() => {
    mockIDERepository = {
      openInIDE: vi.fn().mockResolvedValue({
        command: 'code',
        args: ['/path'],
        method: 'cli',
        pid: 12345
      })
    }

    mockGitAdapter = {
      getRepositoryRoot: vi.fn()
    }

    useCase = new OpenInIDEUseCase({
      ideRepository: mockIDERepository,
      gitAdapter: mockGitAdapter
    })
  })

  describe('validation', () => {
    it('should throw error if filePath is missing', async () => {
      await expect(useCase.execute({ ide: 'vscode' }))
        .rejects.toThrow('File path is required')
    })

    it('should throw error if neither ide nor command is provided', async () => {
      await expect(useCase.execute({ filePath: '/some/path' }))
        .rejects.toThrow('Either IDE or custom command is required')
    })
  })

  describe('opening files', () => {
    it('should open file path in IDE', async () => {
      mockGitAdapter.getRepositoryRoot.mockRejectedValue(new Error('Not a git repo'))

      const result = await useCase.execute({
        filePath: '/path/to/file.js',
        ide: 'vscode'
      })

      expect(mockIDERepository.openInIDE).toHaveBeenCalledWith({
        path: '/path/to/file.js',
        ide: 'vscode',
        command: undefined
      })
      expect(result.isGitRepo).toBe(false)
      expect(result.path).toBe('/path/to/file.js')
    })

    it('should open git repository root when in git repo', async () => {
      mockGitAdapter.getRepositoryRoot.mockResolvedValue('/git/root')

      const result = await useCase.execute({
        filePath: '/git/root/src/file.js',
        ide: 'cursor'
      })

      expect(mockIDERepository.openInIDE).toHaveBeenCalledWith({
        path: '/git/root',
        ide: 'cursor',
        command: undefined
      })
      expect(result.isGitRepo).toBe(true)
      expect(result.path).toBe('/git/root')
      expect(result.originalPath).toBe('/git/root/src/file.js')
    })

    it('should use custom command when provided', async () => {
      mockGitAdapter.getRepositoryRoot.mockRejectedValue(new Error('Not a git repo'))

      await useCase.execute({
        filePath: '/path/to/file.js',
        command: 'nvim'
      })

      expect(mockIDERepository.openInIDE).toHaveBeenCalledWith({
        path: '/path/to/file.js',
        ide: undefined,
        command: 'nvim'
      })
    })
  })
})
