/**
 * Unit tests for InspectProjectUseCase
 * Application Layer - Use Cases orchestrate business logic using repositories
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    access: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn()
  }
}))

// Mock node:module - need to provide actual module
vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createRequire: vi.fn(() => vi.fn())
  }
})

import fs from 'fs/promises'
import { InspectProjectUseCase } from '../../../../src/application/use-cases/InspectProjectUseCase.js'

describe('InspectProjectUseCase - Application Layer', () => {
  let useCase
  let mockProjectRepository
  let mockGitAdapter

  beforeEach(async () => {
    vi.clearAllMocks()

    // Mock the FileSystemProjectRepository
    mockProjectRepository = {
      findByPath: vi.fn()
    }

    // Mock the GitAdapter
    mockGitAdapter = {
      getRepository: vi.fn()
    }

    useCase = new InspectProjectUseCase({
      fileSystemProjectRepository: mockProjectRepository,
      gitAdapter: mockGitAdapter
    })
  })

  describe('execute - Business Logic Orchestration', () => {
    it('should inspect project and return complete nested structure', async () => {
      const mockProject = {
        name: 'test-project',
        label: 'Test Project',
        version: '1.0.0',
        description: 'Test description',
        modules: [
          {
            name: 'hubspot',
            displayName: 'HubSpot',
            modules: { hubspot: { name: 'HubSpot' } }
          }
        ],
        status: { value: 'stopped' }
      }

      mockProjectRepository.findByPath.mockResolvedValue(mockProject)
      mockGitAdapter.getRepository.mockResolvedValue({
        currentBranch: 'main',
        branches: [{ name: 'main', current: true }],
        remotes: ['origin'],
        status: { staged: [], modified: [], untracked: [] }
      })

      // Mock file system for config loading
      fs.readFile.mockImplementation(async (path) => {
        if (path.includes('package.json')) {
          return JSON.stringify({
            name: 'test-project',
            version: '1.0.0',
            scripts: {},
            dependencies: {}
          })
        }
        throw new Error('ENOENT')
      })
      fs.access.mockRejectedValue(new Error('ENOENT'))
      fs.readdir.mockRejectedValue(new Error('ENOENT'))
      fs.stat.mockRejectedValue(new Error('ENOENT'))

      const result = await useCase.execute({ projectPath: '/Users/test/project/backend' })

      expect(result).toBeDefined()
      expect(result.appDefinition).toBeDefined()
      expect(result.appDefinition.name).toBe('test-project')
      expect(result.integrations).toEqual(mockProject.modules)
      expect(result.git).toBeDefined()
      expect(result.structure).toBeDefined()
      expect(result.environment).toBeDefined()

      expect(mockProjectRepository.findByPath).toHaveBeenCalledWith('/Users/test/project/backend')
    })

    it('should handle project with no integrations', async () => {
      const mockProject = {
        name: 'empty-project',
        version: '1.0.0',
        modules: [],
        status: { value: 'stopped' }
      }

      mockProjectRepository.findByPath.mockResolvedValue(mockProject)
      mockGitAdapter.getRepository.mockResolvedValue({
        currentBranch: 'main',
        branches: [],
        remotes: [],
        status: {}
      })

      fs.readFile.mockRejectedValue(new Error('ENOENT'))
      fs.access.mockRejectedValue(new Error('ENOENT'))
      fs.readdir.mockRejectedValue(new Error('ENOENT'))
      fs.stat.mockRejectedValue(new Error('ENOENT'))

      const result = await useCase.execute({ projectPath: '/Users/test/empty-project' })

      expect(result.integrations).toEqual([])
      expect(result.appDefinition.integrations).toEqual([])
    })

    it('should include git status in inspection', async () => {
      const mockProject = {
        name: 'test',
        version: '1.0.0',
        modules: [],
        status: { value: 'stopped' }
      }

      mockProjectRepository.findByPath.mockResolvedValue(mockProject)
      mockGitAdapter.getRepository.mockResolvedValue({
        currentBranch: 'feature/test',
        branches: [
          { name: 'main', current: false, upstream: 'origin/main', ahead: 0, behind: 0 },
          { name: 'feature/test', current: true, upstream: 'origin/feature/test', ahead: 2, behind: 1 }
        ],
        remotes: ['origin'],
        status: { staged: ['file1.js'], modified: ['file2.js'], untracked: [] }
      })

      fs.readFile.mockRejectedValue(new Error('ENOENT'))
      fs.access.mockRejectedValue(new Error('ENOENT'))
      fs.readdir.mockRejectedValue(new Error('ENOENT'))
      fs.stat.mockRejectedValue(new Error('ENOENT'))

      const result = await useCase.execute({ projectPath: '/test/path' })

      expect(result.git.initialized).toBe(true)
      expect(result.git.currentBranch).toBe('feature/test')
      expect(result.git.branches).toHaveLength(2)
      expect(result.git.hasChanges).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should throw error when project not found', async () => {
      mockProjectRepository.findByPath.mockResolvedValue(null)

      await expect(
        useCase.execute({ projectPath: '/nonexistent/path' })
      ).rejects.toThrow('No Frigg project found at /nonexistent/path')
    })

    it('should propagate repository errors', async () => {
      mockProjectRepository.findByPath.mockRejectedValue(
        new Error('Database connection failed')
      )

      await expect(
        useCase.execute({ projectPath: '/test/path' })
      ).rejects.toThrow('Database connection failed')
    })

    it('should handle git adapter errors gracefully', async () => {
      const mockProject = {
        name: 'test',
        version: '1.0.0',
        modules: [],
        status: { value: 'stopped' }
      }

      mockProjectRepository.findByPath.mockResolvedValue(mockProject)
      mockGitAdapter.getRepository.mockRejectedValue(new Error('Not a git repository'))

      fs.readFile.mockRejectedValue(new Error('ENOENT'))
      fs.access.mockRejectedValue(new Error('ENOENT'))
      fs.readdir.mockRejectedValue(new Error('ENOENT'))
      fs.stat.mockRejectedValue(new Error('ENOENT'))

      const result = await useCase.execute({ projectPath: '/test/path' })

      expect(result.git.initialized).toBe(false)
      expect(result.git.error).toBe('Not a git repository')
    })
  })

  describe('Dependency Injection', () => {
    it('should store fileSystemProjectRepository as projectRepo', () => {
      expect(useCase.projectRepo).toBe(mockProjectRepository)
    })

    it('should store gitAdapter', () => {
      expect(useCase.gitAdapter).toBe(mockGitAdapter)
    })
  })

  describe('Project Structure Analysis', () => {
    it('should analyze project structure and check directories', async () => {
      const mockProject = {
        name: 'test',
        version: '1.0.0',
        modules: [],
        status: { value: 'stopped' }
      }

      mockProjectRepository.findByPath.mockResolvedValue(mockProject)
      mockGitAdapter.getRepository.mockResolvedValue({
        currentBranch: 'main',
        branches: [],
        remotes: [],
        status: {}
      })

      // Mock some directories existing
      fs.stat.mockImplementation(async (path) => {
        if (path.includes('src/integrations') || path.includes('package.json')) {
          return { isDirectory: () => path.includes('integrations'), size: 1024 }
        }
        throw new Error('ENOENT')
      })
      fs.readFile.mockRejectedValue(new Error('ENOENT'))
      fs.access.mockRejectedValue(new Error('ENOENT'))
      fs.readdir.mockRejectedValue(new Error('ENOENT'))

      const result = await useCase.execute({ projectPath: '/test/path' })

      expect(result.structure).toBeDefined()
      expect(result.structure.directories).toBeDefined()
      expect(result.structure.files).toBeDefined()
    })
  })

  describe('Environment Info Loading', () => {
    it('should load environment info from .env files', async () => {
      const mockProject = {
        name: 'test',
        version: '1.0.0',
        modules: [],
        status: { value: 'stopped' }
      }

      mockProjectRepository.findByPath.mockResolvedValue(mockProject)
      mockGitAdapter.getRepository.mockResolvedValue({
        currentBranch: 'main',
        branches: [],
        remotes: [],
        status: {}
      })

      fs.readFile.mockImplementation(async (path) => {
        if (path.includes('.env.example')) {
          return 'MONGO_URI=\nAPI_KEY='
        }
        if (path.includes('.env') && !path.includes('example')) {
          return 'MONGO_URI=mongodb://localhost'
        }
        throw new Error('ENOENT')
      })
      fs.access.mockRejectedValue(new Error('ENOENT'))
      fs.readdir.mockRejectedValue(new Error('ENOENT'))
      fs.stat.mockRejectedValue(new Error('ENOENT'))

      const result = await useCase.execute({ projectPath: '/test/path' })

      expect(result.environment).toBeDefined()
      expect(result.environment.required).toContain('MONGO_URI')
      expect(result.environment.required).toContain('API_KEY')
      expect(result.environment.configured).toContain('MONGO_URI')
      expect(result.environment.missing).toContain('API_KEY')
    })
  })
})
