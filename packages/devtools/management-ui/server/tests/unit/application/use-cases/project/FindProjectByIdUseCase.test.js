/**
 * FindProjectByIdUseCase Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FindProjectByIdUseCase } from '../../../../../src/application/use-cases/project/FindProjectByIdUseCase.js'
import { ProjectId } from '../../../../../src/domain/value-objects/ProjectId.js'

describe('FindProjectByIdUseCase', () => {
  let useCase
  let mockProjectRepository

  beforeEach(() => {
    mockProjectRepository = {
      getAvailableRepositories: vi.fn()
    }

    useCase = new FindProjectByIdUseCase({
      projectRepository: mockProjectRepository
    })
  })

  describe('validation', () => {
    it('should throw error if id is missing', async () => {
      await expect(useCase.execute({})).rejects.toThrow('Project ID is required')
    })
  })

  describe('finding projects by root path ID', () => {
    it('should find project by matching root path ID', async () => {
      const rootPath = '/Users/test/repos/my-project'
      const expectedId = ProjectId.generate(rootPath)

      mockProjectRepository.getAvailableRepositories.mockResolvedValue([
        { path: rootPath, name: 'My Project' }
      ])

      const result = await useCase.execute({ id: expectedId })

      expect(result).not.toBeNull()
      expect(result.path).toBe(rootPath)
      expect(result.repository.name).toBe('My Project')
    })

    it('should return null if no matching project found', async () => {
      mockProjectRepository.getAvailableRepositories.mockResolvedValue([
        { path: '/some/path', name: 'Test' }
      ])

      const result = await useCase.execute({ id: 'non-existent-id' })

      expect(result).toBeNull()
    })

    it('should handle empty repositories array', async () => {
      mockProjectRepository.getAvailableRepositories.mockResolvedValue([])

      const result = await useCase.execute({ id: 'any-id' })

      expect(result).toBeNull()
    })

    it('should find correct project among multiple repositories', async () => {
      const targetPath = '/Users/test/repos/project-b'
      const expectedId = ProjectId.generate(targetPath)

      mockProjectRepository.getAvailableRepositories.mockResolvedValue([
        { path: '/Users/test/repos/project-a', name: 'Project A' },
        { path: targetPath, name: 'Project B' },
        { path: '/Users/test/repos/project-c', name: 'Project C' }
      ])

      const result = await useCase.execute({ id: expectedId })

      expect(result).not.toBeNull()
      expect(result.path).toBe(targetPath)
      expect(result.repository.name).toBe('Project B')
    })
  })

  describe('finding projects by subdirectory path ID (backend path)', () => {
    /**
     * This tests the scenario where:
     * - Repository is stored at root path: /Users/sean/Documents/GitHub/quo--frigg
     * - Frigg runs from backend subdir: /Users/sean/Documents/GitHub/quo--frigg/backend
     * - Frontend has ID generated from backend path
     * - We need to resolve this to the parent repository
     */

    it('should resolve backend subdirectory ID using explicit backendPath', async () => {
      const rootPath = '/Users/sean/Documents/GitHub/quo--frigg'
      const backendPath = '/Users/sean/Documents/GitHub/quo--frigg/backend'
      const backendPathId = ProjectId.generate(backendPath)

      mockProjectRepository.getAvailableRepositories.mockResolvedValue([
        { path: rootPath, name: 'Quo Frigg', backendPath }
      ])

      const result = await useCase.execute({ id: backendPathId })

      expect(result).not.toBeNull()
      expect(result.path).toBe(backendPath)
      expect(result.repository.name).toBe('Quo Frigg')
    })

    it('should prefer exact root path match over backend path match', async () => {
      const rootPath = '/Users/test/repo-a'
      const rootPathId = ProjectId.generate(rootPath)

      mockProjectRepository.getAvailableRepositories.mockResolvedValue([
        { path: rootPath, name: 'Repo A', backendPath: '/Users/test/repo-a/backend' },
        { path: '/Users/test/repo-b', name: 'Repo B', backendPath: '/Users/test/repo-b/backend' }
      ])

      const result = await useCase.execute({ id: rootPathId })

      expect(result).not.toBeNull()
      expect(result.path).toBe(rootPath)
      expect(result.repository.name).toBe('Repo A')
    })

    it('should return backend path in result when matched via backend ID', async () => {
      const rootPath = '/Users/test/my-repo'
      const backendPath = '/Users/test/my-repo/backend'
      const backendPathId = ProjectId.generate(backendPath)

      mockProjectRepository.getAvailableRepositories.mockResolvedValue([
        { path: rootPath, name: 'My Repo', backendPath }
      ])

      const result = await useCase.execute({ id: backendPathId })

      expect(result).not.toBeNull()
      // When matched by backend ID, the path should be the backend path
      // so the agent runs in the correct directory
      expect(result.path).toBe(backendPath)
    })

    it('should find repository using explicit backendPath', async () => {
      // Real-world scenario: Frontend only has the backend path ID
      const repos = [
        {
          path: '/Users/sean/Documents/GitHub/frigg',
          name: 'frigg',
          backendPath: null // No backend subdir
        },
        {
          path: '/Users/sean/Documents/GitHub/quo--frigg',
          name: 'quo--frigg',
          backendPath: '/Users/sean/Documents/GitHub/quo--frigg/backend'
        }
      ]

      const quoBackendId = ProjectId.generate('/Users/sean/Documents/GitHub/quo--frigg/backend')

      mockProjectRepository.getAvailableRepositories.mockResolvedValue(repos)

      const result = await useCase.execute({ id: quoBackendId })

      expect(result).not.toBeNull()
      expect(result.repository.name).toBe('quo--frigg')
      expect(result.path).toBe('/Users/sean/Documents/GitHub/quo--frigg/backend')
    })
  })

  describe('finding projects by derived backend path (hasBackend flag)', () => {
    /**
     * This tests when repositories have hasBackend: true but no explicit backendPath.
     * The use case should derive the backend path from root + '/backend'.
     */

    it('should derive backend path from hasBackend flag when ID is for backend', async () => {
      const rootPath = '/Users/test/workspace-project'
      const derivedBackendPath = rootPath + '/backend'
      const backendId = ProjectId.generate(derivedBackendPath)

      mockProjectRepository.getAvailableRepositories.mockResolvedValue([
        { path: rootPath, name: 'Workspace Project', hasBackend: true }
      ])

      const result = await useCase.execute({ id: backendId })

      expect(result).not.toBeNull()
      expect(result.path).toBe(derivedBackendPath)
      expect(result.repository.name).toBe('Workspace Project')
    })

    it('should not derive backend if path already ends with /backend', async () => {
      // If discovery already set path to /backend, don't double-append
      const backendPath = '/Users/test/project/backend'
      const invalidDoubleBackendId = ProjectId.generate(backendPath + '/backend')

      mockProjectRepository.getAvailableRepositories.mockResolvedValue([
        { path: backendPath, name: 'Project', hasBackend: true }
      ])

      const result = await useCase.execute({ id: invalidDoubleBackendId })

      expect(result).toBeNull()
    })

    it('should not derive backend path without hasBackend flag', async () => {
      const rootPath = '/Users/test/simple-repo'
      const nonExistentBackendId = ProjectId.generate(rootPath + '/backend')

      mockProjectRepository.getAvailableRepositories.mockResolvedValue([
        { path: rootPath, name: 'Simple Repo' } // No hasBackend flag
      ])

      const result = await useCase.execute({ id: nonExistentBackendId })

      expect(result).toBeNull()
    })

    it('should find correct repo among multiple with hasBackend', async () => {
      const repos = [
        { path: '/Users/test/project-a', name: 'Project A', hasBackend: true },
        { path: '/Users/test/project-b', name: 'Project B', hasBackend: true },
        { path: '/Users/test/project-c', name: 'Project C', hasBackend: false }
      ]

      const projectBBackendId = ProjectId.generate('/Users/test/project-b/backend')

      mockProjectRepository.getAvailableRepositories.mockResolvedValue(repos)

      const result = await useCase.execute({ id: projectBBackendId })

      expect(result).not.toBeNull()
      expect(result.repository.name).toBe('Project B')
      expect(result.path).toBe('/Users/test/project-b/backend')
    })
  })

  describe('finding projects by root path when discovery set path to backend', () => {
    /**
     * This tests the reverse scenario: discovery set repo.path to /backend
     * but frontend might have an ID from the root path.
     */

    it('should resolve root ID when repo path ends with /backend', async () => {
      const rootPath = '/Users/test/workspace-repo'
      const backendPath = rootPath + '/backend'
      const rootId = ProjectId.generate(rootPath)

      // Discovery already set path to backend
      mockProjectRepository.getAvailableRepositories.mockResolvedValue([
        { path: backendPath, name: 'Workspace Repo' }
      ])

      const result = await useCase.execute({ id: rootId })

      expect(result).not.toBeNull()
      expect(result.path).toBe(rootPath)
      expect(result.repository.name).toBe('Workspace Repo')
    })

    it('should prefer direct path match over derived root match', async () => {
      const directPath = '/Users/test/direct-repo'
      const directId = ProjectId.generate(directPath)

      mockProjectRepository.getAvailableRepositories.mockResolvedValue([
        { path: directPath, name: 'Direct Repo' },
        { path: '/some/other/repo/backend', name: 'Other' }
      ])

      const result = await useCase.execute({ id: directId })

      expect(result).not.toBeNull()
      expect(result.path).toBe(directPath)
      expect(result.repository.name).toBe('Direct Repo')
    })
  })
})
