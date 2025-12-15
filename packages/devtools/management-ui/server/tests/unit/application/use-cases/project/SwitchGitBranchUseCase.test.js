/**
 * SwitchGitBranchUseCase Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SwitchGitBranchUseCase } from '../../../../../src/application/use-cases/project/SwitchGitBranchUseCase.js'

describe('SwitchGitBranchUseCase', () => {
  let useCase
  let mockGitAdapter

  beforeEach(() => {
    mockGitAdapter = {
      checkout: vi.fn(),
      getHeadCommit: vi.fn(),
      isDirty: vi.fn()
    }

    useCase = new SwitchGitBranchUseCase({
      gitAdapter: mockGitAdapter
    })
  })

  describe('validation', () => {
    it('should throw error if projectPath is missing', async () => {
      await expect(useCase.execute({ branchName: 'main' }))
        .rejects.toThrow('Project path is required')
    })

    it('should throw error if branchName is missing', async () => {
      await expect(useCase.execute({ projectPath: '/path' }))
        .rejects.toThrow('Branch name is required')
    })
  })

  describe('switching branches', () => {
    it('should switch to existing branch', async () => {
      mockGitAdapter.checkout.mockResolvedValue()
      mockGitAdapter.getHeadCommit.mockResolvedValue('abc123')
      mockGitAdapter.isDirty.mockResolvedValue(false)

      const result = await useCase.execute({
        projectPath: '/path/to/project',
        branchName: 'develop'
      })

      expect(mockGitAdapter.checkout).toHaveBeenCalledWith('/path/to/project', 'develop', { create: false, force: false })
      expect(result.name).toBe('develop')
      expect(result.headCommit).toBe('abc123')
      expect(result.dirty).toBe(false)
    })

    it('should create new branch when create is true', async () => {
      mockGitAdapter.checkout.mockResolvedValue()
      mockGitAdapter.getHeadCommit.mockResolvedValue('def456')
      mockGitAdapter.isDirty.mockResolvedValue(false)

      await useCase.execute({
        projectPath: '/path/to/project',
        branchName: 'feature/new',
        create: true
      })

      expect(mockGitAdapter.checkout).toHaveBeenCalledWith('/path/to/project', 'feature/new', { create: true, force: false })
    })

    it('should force checkout when force is true', async () => {
      mockGitAdapter.checkout.mockResolvedValue()
      mockGitAdapter.getHeadCommit.mockResolvedValue('ghi789')
      mockGitAdapter.isDirty.mockResolvedValue(true)

      const result = await useCase.execute({
        projectPath: '/path/to/project',
        branchName: 'main',
        force: true
      })

      expect(mockGitAdapter.checkout).toHaveBeenCalledWith('/path/to/project', 'main', { create: false, force: true })
      expect(result.dirty).toBe(true)
    })
  })
})
