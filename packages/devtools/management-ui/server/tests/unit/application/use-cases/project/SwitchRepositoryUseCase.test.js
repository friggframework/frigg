/**
 * SwitchRepositoryUseCase Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SwitchRepositoryUseCase } from '../../../../../src/application/use-cases/project/SwitchRepositoryUseCase.js'

describe('SwitchRepositoryUseCase', () => {
  let useCase
  let mockProjectRepository

  beforeEach(() => {
    mockProjectRepository = {
      getAvailableRepositories: vi.fn(),
      setCurrentWorkingDirectory: vi.fn()
    }

    useCase = new SwitchRepositoryUseCase({
      projectRepository: mockProjectRepository
    })
  })

  describe('validation', () => {
    it('should throw error if repositoryPath is missing', async () => {
      await expect(useCase.execute({})).rejects.toThrow('Repository path is required')
    })

    it('should throw error if repository not found', async () => {
      mockProjectRepository.getAvailableRepositories.mockResolvedValue([
        { path: '/other/path', name: 'Other' }
      ])

      await expect(useCase.execute({ repositoryPath: '/not/found' }))
        .rejects.toThrow('Repository not found')
    })
  })

  describe('switching repositories', () => {
    it('should switch to existing repository', async () => {
      mockProjectRepository.getAvailableRepositories.mockResolvedValue([
        { path: '/path/to/project', name: 'My Project' }
      ])
      mockProjectRepository.setCurrentWorkingDirectory.mockResolvedValue()

      const result = await useCase.execute({ repositoryPath: '/path/to/project' })

      expect(mockProjectRepository.setCurrentWorkingDirectory).toHaveBeenCalledWith('/path/to/project')
      expect(result.repository.name).toBe('My Project')
      expect(result.message).toContain('My Project')
    })
  })
})
