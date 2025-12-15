/**
 * GetGitBranchesUseCase Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GetGitBranchesUseCase } from '../../../../../src/application/use-cases/project/GetGitBranchesUseCase.js'

describe('GetGitBranchesUseCase', () => {
  let useCase
  let mockGitAdapter

  beforeEach(() => {
    mockGitAdapter = {
      getCurrentBranch: vi.fn(),
      getAllBranches: vi.fn()
    }

    useCase = new GetGitBranchesUseCase({
      gitAdapter: mockGitAdapter
    })
  })

  describe('validation', () => {
    it('should throw error if projectPath is missing', async () => {
      await expect(useCase.execute({})).rejects.toThrow('Project path is required')
    })
  })

  describe('getting branches', () => {
    it('should return current branch and all branches', async () => {
      mockGitAdapter.getCurrentBranch.mockResolvedValue('main')
      mockGitAdapter.getAllBranches.mockResolvedValue([
        { name: 'main', type: 'local', isCurrent: true },
        { name: 'feature/new', type: 'local', isCurrent: false },
        { name: 'develop', type: 'remote', isCurrent: false }
      ])

      const result = await useCase.execute({ projectPath: '/path/to/project' })

      expect(result.current).toBe('main')
      expect(result.branches).toHaveLength(3)
      expect(mockGitAdapter.getCurrentBranch).toHaveBeenCalledWith('/path/to/project')
      expect(mockGitAdapter.getAllBranches).toHaveBeenCalledWith('/path/to/project')
    })
  })
})
