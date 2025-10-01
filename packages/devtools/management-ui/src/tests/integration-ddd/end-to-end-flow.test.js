/**
 * End-to-End DDD Flow Integration Tests
 * Testing complete workflows through all DDD layers
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import container from '../../container.js'

// Mock API responses
const mockApiResponses = {
  integrations: {
    list: {
      data: {
        data: {
          integrations: [
            {
              name: 'salesforce',
              displayName: 'Salesforce CRM',
              type: 'api',
              status: 'inactive',
              description: 'Customer relationship management',
              category: 'CRM',
              modules: ['contacts', 'leads'],
              config: {},
              metadata: {}
            },
            {
              name: 'github',
              displayName: 'GitHub',
              type: 'git',
              status: 'active',
              description: 'Version control integration',
              category: 'Development',
              modules: ['repos', 'issues'],
              config: { token: 'encrypted' },
              metadata: { lastSync: '2024-01-01' }
            }
          ]
        }
      }
    },
    install: {
      data: {
        data: {
          integration: {
            name: 'salesforce',
            displayName: 'Salesforce CRM',
            type: 'api',
            status: 'active',
            description: 'Customer relationship management',
            category: 'CRM',
            modules: ['contacts', 'leads'],
            config: { apiKey: 'new-key' },
            metadata: { installedAt: '2024-01-01' }
          }
        }
      }
    }
  },
  project: {
    status: {
      data: {
        data: {
          id: 'test-project',
          name: 'Test Project',
          status: 'stopped',
          port: null,
          path: '/test/project',
          integrations: ['github'],
          config: {
            environment: 'development',
            debug: true
          }
        }
      }
    },
    start: {
      data: {
        data: {
          id: 'test-project',
          name: 'Test Project',
          status: 'running',
          port: 3000,
          path: '/test/project',
          integrations: ['github', 'salesforce'],
          config: {
            environment: 'development',
            debug: true
          }
        }
      }
    }
  }
}

// Mock API client
vi.mock('../../services/api.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}))

describe('End-to-End DDD Flow Tests', () => {
  let mockApiClient

  beforeEach(async () => {
    // Reset container and get fresh API client mock
    container.reset()

    // Import and setup API client mock
    const apiModule = await import('../../services/api.js')
    mockApiClient = apiModule.default

    vi.clearAllMocks()
  })

  describe('Integration Management Workflow', () => {
    it('should complete full integration lifecycle: list → install → verify', async () => {
      // Setup API mocks
      mockApiClient.get.mockResolvedValueOnce(mockApiResponses.integrations.list)
      mockApiClient.post.mockResolvedValueOnce(mockApiResponses.integrations.install)
      mockApiClient.get.mockResolvedValueOnce({
        data: {
          data: {
            integrations: [
              ...mockApiResponses.integrations.list.data.data.integrations.map(int =>
                int.name === 'salesforce' ? { ...int, status: 'active' } : int
              )
            ]
          }
        }
      })

      // Get service through container (tests DI)
      const integrationService = container.resolve('integrationService')

      // Step 1: List all available integrations
      const initialIntegrations = await integrationService.listIntegrations()

      expect(initialIntegrations).toHaveLength(2)
      expect(initialIntegrations[0].name).toBe('salesforce')
      expect(initialIntegrations[0].status).toBe('inactive')
      expect(initialIntegrations[1].name).toBe('github')
      expect(initialIntegrations[1].status).toBe('active')

      // Step 2: Install inactive integration
      const installedIntegration = await integrationService.installIntegration('salesforce')

      expect(installedIntegration.name).toBe('salesforce')
      expect(installedIntegration.status).toBe('active')
      expect(installedIntegration.config).toHaveProperty('apiKey')

      // Step 3: Verify installation by listing again
      const updatedIntegrations = await integrationService.listIntegrations()

      const salesforceIntegration = updatedIntegrations.find(int => int.name === 'salesforce')
      expect(salesforceIntegration.status).toBe('active')

      // Verify API calls made in correct order
      expect(mockApiClient.get).toHaveBeenCalledTimes(2)
      expect(mockApiClient.post).toHaveBeenCalledTimes(1)
      expect(mockApiClient.get).toHaveBeenNthCalledWith(1, '/api/integrations')
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/integrations/install', { name: 'salesforce' })
      expect(mockApiClient.get).toHaveBeenNthCalledWith(2, '/api/integrations')
    })

    it('should handle integration configuration update workflow', async () => {
      // Setup API mocks
      mockApiClient.get.mockResolvedValueOnce(mockApiResponses.integrations.list)
      mockApiClient.put.mockResolvedValueOnce({
        data: {
          data: {
            integration: {
              name: 'github',
              config: { token: 'new-token', webhookUrl: 'https://example.com/webhook' }
            }
          }
        }
      })

      const integrationService = container.resolve('integrationService')

      // Step 1: Get current integration
      const integrations = await integrationService.listIntegrations()
      const githubIntegration = integrations.find(int => int.name === 'github')

      expect(githubIntegration.config.token).toBe('encrypted')

      // Step 2: Update configuration
      const newConfig = {
        token: 'new-token',
        webhookUrl: 'https://example.com/webhook'
      }

      const updatedIntegration = await integrationService.updateIntegrationConfig('github', newConfig)

      expect(updatedIntegration.config.token).toBe('new-token')
      expect(updatedIntegration.config.webhookUrl).toBe('https://example.com/webhook')

      // Verify API calls
      expect(mockApiClient.put).toHaveBeenCalledWith('/api/integrations/github/config', { config: newConfig })
    })
  })

  describe('Project Management Workflow', () => {
    it('should complete project lifecycle: status → start → verify', async () => {
      // Setup API mocks
      mockApiClient.get.mockResolvedValueOnce(mockApiResponses.project.status)
      mockApiClient.post.mockResolvedValueOnce(mockApiResponses.project.start)
      mockApiClient.get.mockResolvedValueOnce({
        data: {
          data: {
            ...mockApiResponses.project.start.data.data,
            status: 'running',
            port: 3000
          }
        }
      })

      const projectService = container.resolve('projectService')

      // Step 1: Check initial project status
      const initialStatus = await projectService.getProjectStatus()

      expect(initialStatus.status).toBe('stopped')
      expect(initialStatus.port).toBeNull()
      expect(initialStatus.integrations).toEqual(['github'])

      // Step 2: Start project
      const startedProject = await projectService.startProject()

      expect(startedProject.status).toBe('running')
      expect(startedProject.port).toBe(3000)
      expect(startedProject.integrations).toEqual(['github', 'salesforce'])

      // Step 3: Verify project is running
      const runningStatus = await projectService.getProjectStatus()

      expect(runningStatus.status).toBe('running')
      expect(runningStatus.port).toBe(3000)

      // Verify API calls
      expect(mockApiClient.get).toHaveBeenCalledTimes(2)
      expect(mockApiClient.post).toHaveBeenCalledTimes(1)
      expect(mockApiClient.get).toHaveBeenNthCalledWith(1, '/api/project/status')
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/project/start', {})
      expect(mockApiClient.get).toHaveBeenNthCalledWith(2, '/api/project/status')
    })

    it('should handle project configuration workflow', async () => {
      // Setup API mocks
      mockApiClient.get.mockResolvedValueOnce({
        data: {
          data: {
            port: 3000,
            environment: 'development',
            debug: true
          }
        }
      })

      mockApiClient.put.mockResolvedValueOnce({
        data: {
          data: {
            id: 'test-project',
            config: {
              port: 4000,
              environment: 'production',
              debug: false,
              newSetting: 'value'
            }
          }
        }
      })

      const projectService = container.resolve('projectService')

      // Step 1: Get current configuration
      const currentConfig = await projectService.getProjectConfig()

      expect(currentConfig.port).toBe(3000)
      expect(currentConfig.environment).toBe('development')
      expect(currentConfig.debug).toBe(true)

      // Step 2: Update configuration
      const newConfig = {
        port: 4000,
        environment: 'production',
        debug: false,
        newSetting: 'value'
      }

      const updatedProject = await projectService.updateProjectConfig(newConfig)

      expect(updatedProject.config.port).toBe(4000)
      expect(updatedProject.config.environment).toBe('production')
      expect(updatedProject.config.debug).toBe(false)
      expect(updatedProject.config.newSetting).toBe('value')

      // Verify API calls
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/project/config')
      expect(mockApiClient.put).toHaveBeenCalledWith('/api/project/config', newConfig)
    })
  })

  describe('Cross-Service Integration Workflow', () => {
    it('should complete complex workflow: install integration → start project with integration', async () => {
      // Setup comprehensive API mocks
      mockApiClient.get
        .mockResolvedValueOnce(mockApiResponses.integrations.list)
        .mockResolvedValueOnce(mockApiResponses.project.status)
        .mockResolvedValueOnce({
          data: {
            data: {
              ...mockApiResponses.project.start.data.data,
              integrations: ['github', 'salesforce'] // Updated with new integration
            }
          }
        })

      mockApiClient.post
        .mockResolvedValueOnce(mockApiResponses.integrations.install)
        .mockResolvedValueOnce(mockApiResponses.project.start)

      const integrationService = container.resolve('integrationService')
      const projectService = container.resolve('projectService')

      // Step 1: Check available integrations
      const integrations = await integrationService.listIntegrations()
      const inactiveIntegrations = integrations.filter(int => int.status === 'inactive')

      expect(inactiveIntegrations).toHaveLength(1)
      expect(inactiveIntegrations[0].name).toBe('salesforce')

      // Step 2: Install new integration
      const installedIntegration = await integrationService.installIntegration('salesforce')

      expect(installedIntegration.status).toBe('active')

      // Step 3: Check project status before starting
      const projectStatus = await projectService.getProjectStatus()

      expect(projectStatus.status).toBe('stopped')
      expect(projectStatus.integrations).toEqual(['github'])

      // Step 4: Start project (should now include new integration)
      const startedProject = await projectService.startProject()

      expect(startedProject.status).toBe('running')
      expect(startedProject.integrations).toContain('salesforce')
      expect(startedProject.integrations).toContain('github')

      // Step 5: Verify final state
      const finalStatus = await projectService.getProjectStatus()

      expect(finalStatus.integrations).toEqual(['github', 'salesforce'])

      // Verify all API calls made
      expect(mockApiClient.get).toHaveBeenCalledTimes(3)
      expect(mockApiClient.post).toHaveBeenCalledTimes(2)
    })

    it('should handle error propagation through all layers', async () => {
      // Setup error scenario
      mockApiClient.get.mockRejectedValueOnce(new Error('Network timeout'))

      const integrationService = container.resolve('integrationService')

      // Error should propagate from Infrastructure → Application → Domain
      await expect(integrationService.listIntegrations()).rejects.toThrow('Failed to fetch integrations: Network timeout')

      // Verify error handling doesn't break container
      expect(() => container.resolve('integrationService')).not.toThrow()
    })
  })

  describe('Performance and Concurrency', () => {
    it('should handle concurrent requests efficiently', async () => {
      // Setup multiple API mocks
      mockApiClient.get
        .mockResolvedValue(mockApiResponses.integrations.list)

      mockApiClient.post
        .mockResolvedValue(mockApiResponses.integrations.install)

      const integrationService = container.resolve('integrationService')
      const projectService = container.resolve('projectService')

      // Make concurrent requests
      const promises = [
        integrationService.listIntegrations(),
        integrationService.listIntegrations(),
        projectService.getProjectStatus(),
        integrationService.installIntegration('salesforce'),
        projectService.getProjectStatus()
      ]

      // Setup additional mocks for concurrent calls
      mockApiClient.get
        .mockResolvedValueOnce(mockApiResponses.project.status)
        .mockResolvedValueOnce(mockApiResponses.project.status)

      const start = performance.now()
      const results = await Promise.all(promises)
      const duration = performance.now() - start

      // All requests should complete
      expect(results).toHaveLength(5)

      // Should be fast (concurrent, not sequential)
      expect(duration).toBeLessThan(100)

      // Verify correct number of API calls
      expect(mockApiClient.get).toHaveBeenCalled()
      expect(mockApiClient.post).toHaveBeenCalled()
    })

    it('should maintain singleton behavior under load', async () => {
      const services = []

      // Resolve same service 100 times
      for (let i = 0; i < 100; i++) {
        services.push(container.resolve('integrationService'))
      }

      // All should be same instance
      const firstService = services[0]
      services.forEach(service => {
        expect(service).toBe(firstService)
      })
    })
  })

  describe('Data Flow Validation', () => {
    it('should preserve data integrity through all layers', async () => {
      const complexIntegration = {
        name: 'complex-integration',
        displayName: 'Complex Integration',
        type: 'api',
        status: 'active',
        config: {
          authentication: {
            type: 'oauth2',
            credentials: {
              clientId: 'client123',
              scopes: ['read', 'write', 'admin']
            }
          },
          endpoints: {
            base: 'https://api.example.com',
            version: 'v2',
            timeout: 30000
          },
          features: {
            webhooks: true,
            batch: true,
            realtime: false
          }
        },
        metadata: {
          version: '2.1.0',
          author: 'Test Team',
          tags: ['production', 'critical'],
          lastUpdated: '2024-01-01T00:00:00Z'
        }
      }

      mockApiClient.get.mockResolvedValueOnce({
        data: {
          data: {
            integrations: [complexIntegration]
          }
        }
      })

      const integrationService = container.resolve('integrationService')
      const integrations = await integrationService.listIntegrations()
      const retrievedIntegration = integrations[0]

      // Verify complex object structure is preserved
      expect(retrievedIntegration).toEqual(complexIntegration)
      expect(retrievedIntegration.config.authentication.credentials.scopes).toEqual(['read', 'write', 'admin'])
      expect(retrievedIntegration.metadata.tags).toEqual(['production', 'critical'])
    })

    it('should handle domain entity validation through repository', async () => {
      // Try to install integration with invalid data
      mockApiClient.post.mockRejectedValueOnce(new Error('Integration name is required and must be a string'))

      const integrationService = container.resolve('integrationService')

      // Error should propagate with domain validation message
      await expect(integrationService.installIntegration('')).rejects.toThrow('Integration name is required and must be a string')
    })
  })

  describe('Resource Management', () => {
    it('should handle container cleanup properly', () => {
      // Resolve services to create instances
      container.resolve('integrationService')
      container.resolve('projectService')

      const beforeCount = container.getRegisteredServices().length

      // Reset should clean up and re-register
      container.reset()

      const afterCount = container.getRegisteredServices().length

      expect(beforeCount).toBeGreaterThan(0)
      expect(afterCount).toEqual(beforeCount)

      // Services should still be resolvable
      expect(() => container.resolve('integrationService')).not.toThrow()
    })

    it('should handle disposal of resources', () => {
      const mockDisposable = {
        dispose: vi.fn()
      }

      container.registerInstance('testDisposable', mockDisposable)
      container.resolve('testDisposable')

      container.dispose()

      expect(mockDisposable.dispose).toHaveBeenCalled()
    })
  })
})