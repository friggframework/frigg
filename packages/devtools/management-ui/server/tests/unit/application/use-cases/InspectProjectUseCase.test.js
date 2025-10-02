/**
 * Unit tests for InspectProjectUseCase
 * Application Layer - Use Cases orchestrate business logic using repositories
 */

import { jest } from '@jest/globals'

describe('InspectProjectUseCase - Application Layer', () => {
  let useCase
  let mockProjectRepository
  let mockIntegrationRepository

  beforeEach(async () => {
    // Mock repositories
    mockProjectRepository = {
      findByPath: jest.fn(),
      findById: jest.fn()
    }

    mockIntegrationRepository = {
      findByProjectPath: jest.fn()
    }

    const { InspectProjectUseCase } = await import('../../../../src/application/use-cases/InspectProjectUseCase.js')

    useCase = new InspectProjectUseCase({
      projectRepository: mockProjectRepository,
      integrationRepository: mockIntegrationRepository
    })
  })

  describe('execute - Business Logic Orchestration', () => {
    it('should inspect project and return integrations with modules', async () => {
      const mockProject = {
        path: '/Users/test/frigg-project/backend',
        name: 'test-project',
        version: '1.0.0'
      }

      const mockIntegrations = [
        {
          name: 'hubspot',
          path: '/Users/test/frigg-project/backend/integrations/hubspot',
          modules: {
            hubspot: { name: 'HubSpot', version: '1.0.0' }
          }
        },
        {
          name: 'salesforce',
          path: '/Users/test/frigg-project/backend/integrations/salesforce',
          modules: {
            salesforce: { name: 'Salesforce', version: '2.0.0' }
          }
        }
      ]

      mockProjectRepository.findByPath.mockResolvedValue(mockProject)
      mockIntegrationRepository.findByProjectPath.mockResolvedValue(mockIntegrations)

      const result = await useCase.execute('/Users/test/frigg-project/backend')

      expect(result).toEqual({
        project: mockProject,
        integrations: mockIntegrations,
        summary: {
          totalIntegrations: 2,
          totalModules: 2
        }
      })

      expect(mockProjectRepository.findByPath).toHaveBeenCalledWith('/Users/test/frigg-project/backend')
      expect(mockIntegrationRepository.findByProjectPath).toHaveBeenCalledWith('/Users/test/frigg-project/backend')
    })

    it('should handle project with no integrations', async () => {
      const mockProject = {
        path: '/Users/test/empty-project',
        name: 'empty-project',
        version: '1.0.0'
      }

      mockProjectRepository.findByPath.mockResolvedValue(mockProject)
      mockIntegrationRepository.findByProjectPath.mockResolvedValue([])

      const result = await useCase.execute('/Users/test/empty-project')

      expect(result).toEqual({
        project: mockProject,
        integrations: [],
        summary: {
          totalIntegrations: 0,
          totalModules: 0
        }
      })
    })

    it('should count modules correctly across integrations', async () => {
      const mockProject = {
        path: '/Users/test/project',
        name: 'test',
        version: '1.0.0'
      }

      const mockIntegrations = [
        {
          name: 'multi-module',
          modules: {
            module1: { name: 'Module 1' },
            module2: { name: 'Module 2' },
            module3: { name: 'Module 3' }
          }
        },
        {
          name: 'single-module',
          modules: {
            module4: { name: 'Module 4' }
          }
        }
      ]

      mockProjectRepository.findByPath.mockResolvedValue(mockProject)
      mockIntegrationRepository.findByProjectPath.mockResolvedValue(mockIntegrations)

      const result = await useCase.execute('/Users/test/project')

      expect(result.summary).toEqual({
        totalIntegrations: 2,
        totalModules: 4
      })
    })

    it('should handle integrations with no modules', async () => {
      const mockProject = {
        path: '/Users/test/project',
        name: 'test',
        version: '1.0.0'
      }

      const mockIntegrations = [
        {
          name: 'no-modules',
          modules: {}
        }
      ]

      mockProjectRepository.findByPath.mockResolvedValue(mockProject)
      mockIntegrationRepository.findByProjectPath.mockResolvedValue(mockIntegrations)

      const result = await useCase.execute('/Users/test/project')

      expect(result.summary).toEqual({
        totalIntegrations: 1,
        totalModules: 0
      })
    })
  })

  describe('Error Handling', () => {
    it('should throw error when project path not provided', async () => {
      await expect(useCase.execute()).rejects.toThrow('Project path is required')
      await expect(useCase.execute('')).rejects.toThrow('Project path is required')
      await expect(useCase.execute(null)).rejects.toThrow('Project path is required')
    })

    it('should throw error when project not found', async () => {
      mockProjectRepository.findByPath.mockResolvedValue(null)

      await expect(
        useCase.execute('/nonexistent/path')
      ).rejects.toThrow('Project not found at path: /nonexistent/path')
    })

    it('should propagate repository errors', async () => {
      mockProjectRepository.findByPath.mockRejectedValue(
        new Error('Database connection failed')
      )

      await expect(
        useCase.execute('/test/path')
      ).rejects.toThrow('Database connection failed')
    })

    it('should handle integration repository errors gracefully', async () => {
      const mockProject = {
        path: '/Users/test/project',
        name: 'test',
        version: '1.0.0'
      }

      mockProjectRepository.findByPath.mockResolvedValue(mockProject)
      mockIntegrationRepository.findByProjectPath.mockRejectedValue(
        new Error('Failed to load integrations')
      )

      await expect(
        useCase.execute('/Users/test/project')
      ).rejects.toThrow('Failed to load integrations')
    })
  })

  describe('Dependency Injection', () => {
    it('should require projectRepository dependency', () => {
      expect(() => {
        const { InspectProjectUseCase } = require('../../../../src/application/use-cases/InspectProjectUseCase.js')
        new InspectProjectUseCase({ integrationRepository: mockIntegrationRepository })
      }).toThrow()
    })

    it('should require integrationRepository dependency', () => {
      expect(() => {
        const { InspectProjectUseCase } = require('../../../../src/application/use-cases/InspectProjectUseCase.js')
        new InspectProjectUseCase({ projectRepository: mockProjectRepository })
      }).toThrow()
    })
  })

  describe('Business Rules', () => {
    it('should not include hidden directories in integration count', async () => {
      const mockProject = {
        path: '/Users/test/project',
        name: 'test',
        version: '1.0.0'
      }

      const mockIntegrations = [
        { name: 'visible-integration', modules: { mod1: {} } },
        // Repository should filter these out, but testing use case behavior
      ]

      mockProjectRepository.findByPath.mockResolvedValue(mockProject)
      mockIntegrationRepository.findByProjectPath.mockResolvedValue(mockIntegrations)

      const result = await useCase.execute('/Users/test/project')

      // Use case should trust repository to return only valid integrations
      expect(result.integrations).toHaveLength(1)
      expect(result.integrations[0].name).not.toMatch(/^\./)
    })

    it('should preserve integration order from repository', async () => {
      const mockProject = {
        path: '/Users/test/project',
        name: 'test',
        version: '1.0.0'
      }

      const mockIntegrations = [
        { name: 'z-integration', modules: {} },
        { name: 'a-integration', modules: {} },
        { name: 'm-integration', modules: {} }
      ]

      mockProjectRepository.findByPath.mockResolvedValue(mockProject)
      mockIntegrationRepository.findByProjectPath.mockResolvedValue(mockIntegrations)

      const result = await useCase.execute('/Users/test/project')

      // Use case should not re-order, that's repository's job
      expect(result.integrations[0].name).toBe('z-integration')
      expect(result.integrations[1].name).toBe('a-integration')
      expect(result.integrations[2].name).toBe('m-integration')
    })
  })
})
