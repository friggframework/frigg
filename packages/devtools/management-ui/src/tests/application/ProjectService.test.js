/**
 * ProjectService Application Layer Tests
 * Testing use case orchestration and business logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ProjectService } from '../../application/services/ProjectService.js'

// Mock repository
const mockProjectRepository = {
  getStatus: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  restart: vi.fn(),
  getConfig: vi.fn(),
  updateConfig: vi.fn()
}

describe('ProjectService Application Layer', () => {
  let projectService

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Create service with mock repository
    projectService = new ProjectService(mockProjectRepository)
  })

  describe('getProjectStatus', () => {
    it('should return project status from repository', async () => {
      const mockStatus = {
        id: 'test-project',
        name: 'Test Project',
        status: 'running',
        port: 3000
      }

      mockProjectRepository.getStatus.mockResolvedValue(mockStatus)

      const result = await projectService.getProjectStatus()

      expect(mockProjectRepository.getStatus).toHaveBeenCalledOnce()
      expect(result).toEqual(mockStatus)
    })

    it('should handle repository errors', async () => {
      const error = new Error('Failed to get status')
      mockProjectRepository.getStatus.mockRejectedValue(error)

      await expect(projectService.getProjectStatus()).rejects.toThrow('Failed to get status')
    })

    it('should return default status when project not found', async () => {
      const defaultStatus = {
        status: 'stopped',
        port: null,
        integrations: []
      }

      mockProjectRepository.getStatus.mockResolvedValue(defaultStatus)

      const result = await projectService.getProjectStatus()

      expect(result).toEqual(defaultStatus)
    })
  })

  describe('startProject', () => {
    it('should start project successfully', async () => {
      const mockProject = {
        id: 'test-project',
        status: 'running',
        port: 3000
      }

      mockProjectRepository.start.mockResolvedValue(mockProject)

      const result = await projectService.startProject()

      expect(mockProjectRepository.start).toHaveBeenCalledOnce()
      expect(result).toEqual(mockProject)
    })

    it('should handle start errors', async () => {
      const error = new Error('Failed to start project')
      mockProjectRepository.start.mockRejectedValue(error)

      await expect(projectService.startProject()).rejects.toThrow('Failed to start project')
    })

    it('should start project with options', async () => {
      const options = { port: 4000, environment: 'development' }
      const mockProject = {
        id: 'test-project',
        status: 'running',
        port: 4000
      }

      mockProjectRepository.start.mockResolvedValue(mockProject)

      const result = await projectService.startProject(options)

      expect(mockProjectRepository.start).toHaveBeenCalledWith(options)
      expect(result).toEqual(mockProject)
    })
  })

  describe('stopProject', () => {
    it('should stop project successfully', async () => {
      const mockProject = {
        id: 'test-project',
        status: 'stopped',
        port: null
      }

      mockProjectRepository.stop.mockResolvedValue(mockProject)

      const result = await projectService.stopProject()

      expect(mockProjectRepository.stop).toHaveBeenCalledOnce()
      expect(result).toEqual(mockProject)
    })

    it('should handle stop errors', async () => {
      const error = new Error('Failed to stop project')
      mockProjectRepository.stop.mockRejectedValue(error)

      await expect(projectService.stopProject()).rejects.toThrow('Failed to stop project')
    })

    it('should stop project gracefully', async () => {
      const options = { graceful: true, timeout: 5000 }
      const mockProject = {
        id: 'test-project',
        status: 'stopped',
        port: null
      }

      mockProjectRepository.stop.mockResolvedValue(mockProject)

      const result = await projectService.stopProject(options)

      expect(mockProjectRepository.stop).toHaveBeenCalledWith(options)
      expect(result).toEqual(mockProject)
    })
  })

  describe('restartProject', () => {
    it('should restart project successfully', async () => {
      const mockProject = {
        id: 'test-project',
        status: 'running',
        port: 3000
      }

      mockProjectRepository.restart.mockResolvedValue(mockProject)

      const result = await projectService.restartProject()

      expect(mockProjectRepository.restart).toHaveBeenCalledOnce()
      expect(result).toEqual(mockProject)
    })

    it('should handle restart errors', async () => {
      const error = new Error('Failed to restart project')
      mockProjectRepository.restart.mockRejectedValue(error)

      await expect(projectService.restartProject()).rejects.toThrow('Failed to restart project')
    })

    it('should restart project with options', async () => {
      const options = { port: 4000, clearCache: true }
      const mockProject = {
        id: 'test-project',
        status: 'running',
        port: 4000
      }

      mockProjectRepository.restart.mockResolvedValue(mockProject)

      const result = await projectService.restartProject(options)

      expect(mockProjectRepository.restart).toHaveBeenCalledWith(options)
      expect(result).toEqual(mockProject)
    })
  })

  describe('getProjectConfig', () => {
    it('should return project configuration', async () => {
      const mockConfig = {
        port: 3000,
        environment: 'development',
        integrations: ['salesforce', 'github'],
        debug: true
      }

      mockProjectRepository.getConfig.mockResolvedValue(mockConfig)

      const result = await projectService.getProjectConfig()

      expect(mockProjectRepository.getConfig).toHaveBeenCalledOnce()
      expect(result).toEqual(mockConfig)
    })

    it('should handle config fetch errors', async () => {
      const error = new Error('Failed to get config')
      mockProjectRepository.getConfig.mockRejectedValue(error)

      await expect(projectService.getProjectConfig()).rejects.toThrow('Failed to get config')
    })

    it('should return empty config when none exists', async () => {
      mockProjectRepository.getConfig.mockResolvedValue({})

      const result = await projectService.getProjectConfig()

      expect(result).toEqual({})
    })
  })

  describe('updateProjectConfig', () => {
    it('should update project configuration successfully', async () => {
      const newConfig = {
        port: 4000,
        environment: 'production',
        debug: false
      }

      const updatedProject = {
        id: 'test-project',
        config: newConfig
      }

      mockProjectRepository.updateConfig.mockResolvedValue(updatedProject)

      const result = await projectService.updateProjectConfig(newConfig)

      expect(mockProjectRepository.updateConfig).toHaveBeenCalledWith(newConfig)
      expect(result).toEqual(updatedProject)
    })

    it('should validate config parameter', async () => {
      await expect(projectService.updateProjectConfig(null)).rejects.toThrow('Configuration is required and must be an object')
      await expect(projectService.updateProjectConfig(undefined)).rejects.toThrow('Configuration is required and must be an object')
      await expect(projectService.updateProjectConfig('string')).rejects.toThrow('Configuration is required and must be an object')
      await expect(projectService.updateProjectConfig(123)).rejects.toThrow('Configuration is required and must be an object')
    })

    it('should handle config update errors', async () => {
      const error = new Error('Failed to update config')
      mockProjectRepository.updateConfig.mockRejectedValue(error)

      await expect(projectService.updateProjectConfig({ port: 4000 })).rejects.toThrow('Failed to update config')
    })

    it('should merge config with existing settings', async () => {
      const partialConfig = { port: 4000 }
      const mergedProject = {
        id: 'test-project',
        config: {
          port: 4000,
          environment: 'development',
          debug: true
        }
      }

      mockProjectRepository.updateConfig.mockResolvedValue(mergedProject)

      const result = await projectService.updateProjectConfig(partialConfig)

      expect(result).toEqual(mergedProject)
    })
  })

  describe('service initialization', () => {
    it('should initialize use cases correctly', () => {
      expect(projectService.getProjectStatusUseCase).toBeDefined()
      expect(projectService.startProjectUseCase).toBeDefined()
      expect(projectService.stopProjectUseCase).toBeDefined()
    })

    it('should pass repository to use cases', () => {
      expect(projectService.getProjectStatusUseCase.projectRepository).toBe(mockProjectRepository)
      expect(projectService.startProjectUseCase.projectRepository).toBe(mockProjectRepository)
      expect(projectService.stopProjectUseCase.projectRepository).toBe(mockProjectRepository)
    })
  })

  describe('error handling', () => {
    it('should propagate repository errors', async () => {
      const repoError = new Error('Repository error')
      mockProjectRepository.getStatus.mockRejectedValue(repoError)

      await expect(projectService.getProjectStatus()).rejects.toThrow('Repository error')
    })

    it('should handle validation errors', async () => {
      await expect(projectService.updateProjectConfig([])).rejects.toThrow('Configuration is required and must be an object')
    })

    it('should handle network errors gracefully', async () => {
      const networkError = new Error('Network timeout')
      mockProjectRepository.start.mockRejectedValue(networkError)

      await expect(projectService.startProject()).rejects.toThrow('Network timeout')
    })
  })

  describe('integration with Use Cases', () => {
    it('should delegate to GetProjectStatusUseCase', async () => {
      const mockStatus = { status: 'running', port: 3000 }
      mockProjectRepository.getStatus.mockResolvedValue(mockStatus)

      const result = await projectService.getProjectStatus()

      expect(result).toEqual(mockStatus)
      expect(mockProjectRepository.getStatus).toHaveBeenCalledOnce()
    })

    it('should delegate to StartProjectUseCase', async () => {
      const mockProject = { status: 'running', port: 3000 }
      mockProjectRepository.start.mockResolvedValue(mockProject)

      const result = await projectService.startProject()

      expect(result).toEqual(mockProject)
      expect(mockProjectRepository.start).toHaveBeenCalledOnce()
    })

    it('should delegate to StopProjectUseCase', async () => {
      const mockProject = { status: 'stopped', port: null }
      mockProjectRepository.stop.mockResolvedValue(mockProject)

      const result = await projectService.stopProject()

      expect(result).toEqual(mockProject)
      expect(mockProjectRepository.stop).toHaveBeenCalledOnce()
    })
  })

  describe('complex scenarios', () => {
    it('should handle rapid start/stop calls', async () => {
      const startPromise = projectService.startProject()
      const stopPromise = projectService.stopProject()

      mockProjectRepository.start.mockResolvedValue({ status: 'running' })
      mockProjectRepository.stop.mockResolvedValue({ status: 'stopped' })

      const [startResult, stopResult] = await Promise.all([startPromise, stopPromise])

      expect(startResult.status).toBe('running')
      expect(stopResult.status).toBe('stopped')
    })

    it('should handle config updates during project operation', async () => {
      const statusPromise = projectService.getProjectStatus()
      const configPromise = projectService.updateProjectConfig({ debug: true })

      mockProjectRepository.getStatus.mockResolvedValue({ status: 'running' })
      mockProjectRepository.updateConfig.mockResolvedValue({ config: { debug: true } })

      const [status, config] = await Promise.all([statusPromise, configPromise])

      expect(status.status).toBe('running')
      expect(config.config.debug).toBe(true)
    })
  })
})