/**
 * Unit tests for Git Domain Service
 * Following DDD principles - pure domain logic
 */

import { jest } from '@jest/globals'

describe('GitService', () => {
  let GitService
  let gitService
  let mockGitAdapter

  beforeEach(async () => {
    // Dynamic import to avoid hoisting issues
    const module = await import('../../../../src/domain/services/GitService.js')
    GitService = module.GitService

    // Mock git adapter
    mockGitAdapter = {
      getStatus: jest.fn(),
      getBranches: jest.fn(),
      getCurrentBranch: jest.fn(),
      switchBranch: jest.fn(),
      getRepository: jest.fn()
    }

    gitService = new GitService({ gitAdapter: mockGitAdapter })
  })

  describe('getStatus', () => {
    it('should return formatted git status with counts', async () => {
      mockGitAdapter.getStatus.mockResolvedValue({
        staged: ['file1.js', 'file2.js'],
        unstaged: ['file3.js'],
        untracked: ['file4.js', 'file5.js', 'file6.js']
      })

      mockGitAdapter.getCurrentBranch.mockResolvedValue('main')

      const result = await gitService.getStatus('/test/path')

      expect(result).toEqual({
        currentBranch: 'main',
        status: {
          staged: 2,
          unstaged: 1,
          untracked: 3
        }
      })
    })

    it('should handle empty status', async () => {
      mockGitAdapter.getStatus.mockResolvedValue({
        staged: [],
        unstaged: [],
        untracked: []
      })

      mockGitAdapter.getCurrentBranch.mockResolvedValue('main')

      const result = await gitService.getStatus('/test/path')

      expect(result.status).toEqual({
        staged: 0,
        unstaged: 0,
        untracked: 0
      })
    })

    it('should handle git errors gracefully', async () => {
      mockGitAdapter.getStatus.mockRejectedValue(new Error('Not a git repository'))

      await expect(gitService.getStatus('/test/path'))
        .rejects
        .toThrow('Not a git repository')
    })
  })

  describe('getDetailedStatus', () => {
    it('should return detailed file lists for git status', async () => {
      const mockStatus = {
        staged: ['src/file1.js', 'src/file2.js'],
        unstaged: ['README.md'],
        untracked: ['temp.log']
      }

      mockGitAdapter.getStatus.mockResolvedValue(mockStatus)
      mockGitAdapter.getCurrentBranch.mockResolvedValue('develop')

      const result = await gitService.getDetailedStatus('/test/path')

      expect(result).toEqual({
        branch: 'develop',
        staged: mockStatus.staged,
        unstaged: mockStatus.unstaged,
        untracked: mockStatus.untracked,
        clean: false
      })
    })

    it('should mark as clean when no changes', async () => {
      mockGitAdapter.getStatus.mockResolvedValue({
        staged: [],
        unstaged: [],
        untracked: []
      })

      mockGitAdapter.getCurrentBranch.mockResolvedValue('main')

      const result = await gitService.getDetailedStatus('/test/path')

      expect(result.clean).toBe(true)
    })
  })

  describe('getBranches', () => {
    it('should return formatted branch list', async () => {
      const mockBranches = [
        { name: 'main', current: true, upstream: 'origin/main' },
        { name: 'develop', current: false, upstream: null },
        { name: 'origin/feature', current: false, upstream: null, remote: true }
      ]

      mockGitAdapter.getBranches.mockResolvedValue(mockBranches)
      mockGitAdapter.getCurrentBranch.mockResolvedValue('main')

      const result = await gitService.getBranches('/test/path')

      expect(result).toHaveProperty('current', 'main')
      expect(result).toHaveProperty('branches')
      expect(Array.isArray(result.branches)).toBe(true)
      expect(result.branches.length).toBe(3)
    })
  })
})