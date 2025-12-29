/**
 * ListRepositoriesUseCase Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ListRepositoriesUseCase } from '../../../../../src/application/use-cases/project/ListRepositoriesUseCase.js'

describe('ListRepositoriesUseCase', () => {
  let useCase
  let mockProjectRepository

  beforeEach(() => {
    mockProjectRepository = {
      getAvailableRepositories: vi.fn(),
      getCurrentWorkingDirectory: vi.fn()
    }

    useCase = new ListRepositoriesUseCase({
      projectRepository: mockProjectRepository
    })
  })

  describe('listing repositories', () => {
    it('should list repositories with deterministic IDs', async () => {
      mockProjectRepository.getAvailableRepositories.mockResolvedValue([
        { path: '/path/to/project-a', name: 'Project A' },
        { path: '/path/to/project-b', name: 'Project B' }
      ])
      mockProjectRepository.getCurrentWorkingDirectory.mockResolvedValue('/current/dir')

      const result = await useCase.execute()

      expect(result.repositories).toHaveLength(2)
      expect(result.repositories[0]).toHaveProperty('id')
      expect(result.repositories[0].name).toBe('Project A')
      expect(result.repositories[1]).toHaveProperty('id')
      expect(result.repositories[1].name).toBe('Project B')
      expect(result.currentWorkingDirectory).toBe('/current/dir')
      expect(result.count).toBe(2)
    })

    it('should handle empty repositories', async () => {
      mockProjectRepository.getAvailableRepositories.mockResolvedValue([])
      mockProjectRepository.getCurrentWorkingDirectory.mockResolvedValue('/current/dir')

      const result = await useCase.execute()

      expect(result.repositories).toHaveLength(0)
      expect(result.count).toBe(0)
    })

    it('should generate unique IDs for each repository', async () => {
      mockProjectRepository.getAvailableRepositories.mockResolvedValue([
        { path: '/path/a', name: 'A' },
        { path: '/path/b', name: 'B' },
        { path: '/path/c', name: 'C' }
      ])
      mockProjectRepository.getCurrentWorkingDirectory.mockResolvedValue('/current')

      const result = await useCase.execute()

      const ids = result.repositories.map(r => r.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(3) // All IDs should be unique
    })
  })
})
