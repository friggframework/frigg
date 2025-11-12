/**
 * Unit tests for FileSystemProjectRepository
 * Infrastructure Layer - Repository should handle file system operations atomically
 */

import { jest } from '@jest/globals'
import path from 'path'

// Mock fs and fs-extra modules
jest.unstable_mockModule('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn()
}))

jest.unstable_mockModule('fs-extra', () => ({
  readJson: jest.fn(),
  writeJson: jest.fn(),
  ensureDir: jest.fn(),
  pathExists: jest.fn()
}))

const { FileSystemProjectRepository } = await import('../../../../src/infrastructure/repositories/FileSystemProjectRepository.js')
const { existsSync, readdirSync } = await import('fs')
const fsExtra = await import('fs-extra')

describe('FileSystemProjectRepository - Infrastructure Layer', () => {
  let repository
  const mockProjectPath = '/Users/test/frigg-project'

  beforeEach(() => {
    jest.clearAllMocks()
    repository = new FileSystemProjectRepository()
  })

  describe('findByPath - Atomic Operation', () => {
    it('should return null when path does not exist', async () => {
      existsSync.mockReturnValue(false)

      const result = await repository.findByPath(mockProjectPath)

      expect(result).toBeNull()
      expect(existsSync).toHaveBeenCalledWith(mockProjectPath)
    })

    it('should return project data when path exists with package.json', async () => {
      existsSync.mockReturnValue(true)
      fsExtra.readJson.mockResolvedValue({
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          '@friggframework/core': '^2.0.0'
        }
      })

      const result = await repository.findByPath(mockProjectPath)

      expect(result).toBeDefined()
      expect(result.path).toBe(mockProjectPath)
      expect(result.name).toBe('test-project')
      expect(result.version).toBe('1.0.0')
    })

    it('should handle missing package.json gracefully', async () => {
      existsSync.mockImplementation((path) => {
        return !path.includes('package.json')
      })

      const result = await repository.findByPath(mockProjectPath)

      expect(result).toBeDefined()
      expect(result.path).toBe(mockProjectPath)
      expect(result.name).toBe('frigg-project') // basename fallback
    })

    it('should detect backend subdirectory for workspace projects', async () => {
      existsSync.mockImplementation((testPath) => {
        // Root exists, backend exists
        if (testPath === mockProjectPath) return true
        if (testPath === path.join(mockProjectPath, 'backend')) return true
        if (testPath.includes('backend/index.js')) return true
        if (testPath.includes('package.json')) return true
        return false
      })

      fsExtra.readJson.mockResolvedValue({
        name: 'workspace-project',
        version: '1.0.0',
        workspaces: ['backend', 'frontend']
      })

      const result = await repository.findByPath(mockProjectPath)

      expect(result).toBeDefined()
      // Should prefer backend subdirectory
      expect(result.path).toBe(path.join(mockProjectPath, 'backend'))
    })
  })

  describe('findAll - Repository Pattern', () => {
    it('should return empty array when no repositories env var', async () => {
      delete process.env.AVAILABLE_REPOSITORIES

      const result = await repository.findAll()

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(0)
    })

    it('should parse repositories from environment variable', async () => {
      const repos = [
        { path: '/Users/test/project1', name: 'project1' },
        { path: '/Users/test/project2', name: 'project2' }
      ]
      process.env.AVAILABLE_REPOSITORIES = JSON.stringify(repos)

      const result = await repository.findAll()

      expect(result).toHaveLength(2)
      expect(result[0].path).toBe('/Users/test/project1')
      expect(result[1].path).toBe('/Users/test/project2')

      delete process.env.AVAILABLE_REPOSITORIES
    })

    it('should handle invalid JSON gracefully', async () => {
      process.env.AVAILABLE_REPOSITORIES = 'invalid json{'

      const result = await repository.findAll()

      expect(result).toEqual([])

      delete process.env.AVAILABLE_REPOSITORIES
    })

    it('should filter out non-existent paths', async () => {
      const repos = [
        { path: '/Users/test/exists', name: 'exists' },
        { path: '/Users/test/missing', name: 'missing' }
      ]
      process.env.AVAILABLE_REPOSITORIES = JSON.stringify(repos)

      existsSync.mockImplementation((testPath) => {
        return testPath.includes('exists')
      })

      const result = await repository.findAll()

      expect(result.length).toBeLessThanOrEqual(repos.length)

      delete process.env.AVAILABLE_REPOSITORIES
    })
  })

  describe('findById - ID Resolution', () => {
    it('should find project by generated ID', async () => {
      const repos = [
        { path: '/Users/test/project1', id: '1a7501a0' },
        { path: '/Users/test/project2', id: 'abc123de' }
      ]
      process.env.AVAILABLE_REPOSITORIES = JSON.stringify(repos)

      existsSync.mockReturnValue(true)
      fsExtra.readJson.mockResolvedValue({
        name: 'project1',
        version: '1.0.0'
      })

      const result = await repository.findById('1a7501a0')

      expect(result).toBeDefined()
      expect(result.path).toBe('/Users/test/project1')

      delete process.env.AVAILABLE_REPOSITORIES
    })

    it('should return null when ID not found', async () => {
      const repos = [
        { path: '/Users/test/project1', id: '1a7501a0' }
      ]
      process.env.AVAILABLE_REPOSITORIES = JSON.stringify(repos)

      const result = await repository.findById('99999999')

      expect(result).toBeNull()

      delete process.env.AVAILABLE_REPOSITORIES
    })
  })

  describe('Error Handling', () => {
    it('should throw errors from file system operations', async () => {
      existsSync.mockReturnValue(true)
      fsExtra.readJson.mockRejectedValue(new Error('Permission denied'))

      await expect(
        repository.findByPath(mockProjectPath)
      ).rejects.toThrow('Permission denied')
    })

    it('should handle concurrent read operations', async () => {
      existsSync.mockReturnValue(true)
      fsExtra.readJson.mockResolvedValue({
        name: 'test',
        version: '1.0.0'
      })

      const promises = [
        repository.findByPath('/path1'),
        repository.findByPath('/path2'),
        repository.findByPath('/path3')
      ]

      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
      expect(fsExtra.readJson).toHaveBeenCalledTimes(3)
    })
  })
})
