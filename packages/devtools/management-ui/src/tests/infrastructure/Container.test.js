/**
 * DDD Container Integration Tests
 * Testing dependency injection and service wiring
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import container from '../../container.js'
import { IntegrationService } from '../../application/services/IntegrationService.js'
import { ProjectService } from '../../application/services/ProjectService.js'
import { IntegrationRepositoryAdapter } from '../../infrastructure/adapters/IntegrationRepositoryAdapter.js'
import { ProjectRepositoryAdapter } from '../../infrastructure/adapters/ProjectRepositoryAdapter.js'

// Mock API client
vi.mock('../../services/api.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}))

describe('DDD Container Integration Tests', () => {
  beforeEach(() => {
    // Reset container between tests
    container.reset()
  })

  describe('Container initialization', () => {
    it('should register all required dependencies', () => {
      const registeredServices = container.getRegisteredServices()

      expect(registeredServices).toContain('apiClient')
      expect(registeredServices).toContain('integrationRepository')
      expect(registeredServices).toContain('projectRepository')
      expect(registeredServices).toContain('integrationService')
      expect(registeredServices).toContain('projectService')
    })

    it('should have correct service count', () => {
      const registeredServices = container.getRegisteredServices()

      // Should have at least 5 core services
      expect(registeredServices.length).toBeGreaterThanOrEqual(5)
    })
  })

  describe('Dependency resolution', () => {
    it('should resolve API client', () => {
      const apiClient = container.resolve('apiClient')

      expect(apiClient).toBeDefined()
      expect(typeof apiClient.get).toBe('function')
      expect(typeof apiClient.post).toBe('function')
      expect(typeof apiClient.put).toBe('function')
      expect(typeof apiClient.delete).toBe('function')
    })

    it('should resolve repository adapters', () => {
      const integrationRepo = container.resolve('integrationRepository')
      const projectRepo = container.resolve('projectRepository')

      expect(integrationRepo).toBeInstanceOf(IntegrationRepositoryAdapter)
      expect(projectRepo).toBeInstanceOf(ProjectRepositoryAdapter)
    })

    it('should resolve application services', () => {
      const integrationService = container.resolve('integrationService')
      const projectService = container.resolve('projectService')

      expect(integrationService).toBeInstanceOf(IntegrationService)
      expect(projectService).toBeInstanceOf(ProjectService)
    })
  })

  describe('Singleton behavior', () => {
    it('should return same instance for singletons', () => {
      const service1 = container.resolve('integrationService')
      const service2 = container.resolve('integrationService')

      expect(service1).toBe(service2)
    })

    it('should return same repository instance', () => {
      const repo1 = container.resolve('integrationRepository')
      const repo2 = container.resolve('integrationRepository')

      expect(repo1).toBe(repo2)
    })

    it('should maintain singleton across different service resolutions', () => {
      const apiClient1 = container.resolve('apiClient')
      const integrationRepo = container.resolve('integrationRepository')
      const apiClient2 = container.resolve('apiClient')

      expect(apiClient1).toBe(apiClient2)
      expect(integrationRepo.apiClient).toBe(apiClient1)
    })
  })

  describe('Dependency injection', () => {
    it('should inject dependencies correctly into services', () => {
      const integrationService = container.resolve('integrationService')
      const integrationRepo = container.resolve('integrationRepository')

      expect(integrationService.integrationRepository).toBe(integrationRepo)
    })

    it('should inject API client into all repository adapters', () => {
      const apiClient = container.resolve('apiClient')
      const integrationRepo = container.resolve('integrationRepository')
      const projectRepo = container.resolve('projectRepository')

      expect(integrationRepo.apiClient).toBe(apiClient)
      expect(projectRepo.apiClient).toBe(apiClient)
    })
  })

  describe('Service layer integration', () => {
    it('should have working integration service with use cases', () => {
      const integrationService = container.resolve('integrationService')

      expect(integrationService.listIntegrationsUseCase).toBeDefined()
      expect(integrationService.installIntegrationUseCase).toBeDefined()
      expect(typeof integrationService.listIntegrations).toBe('function')
      expect(typeof integrationService.installIntegration).toBe('function')
    })

    it('should have working project service with use cases', () => {
      const projectService = container.resolve('projectService')

      expect(projectService.getProjectStatusUseCase).toBeDefined()
      expect(projectService.startProjectUseCase).toBeDefined()
      expect(projectService.stopProjectUseCase).toBeDefined()
      expect(typeof projectService.getProjectStatus).toBe('function')
      expect(typeof projectService.startProject).toBe('function')
      expect(typeof projectService.stopProject).toBe('function')
    })
  })

  describe('Error handling', () => {
    it('should throw error for unregistered dependency', () => {
      expect(() => {
        container.resolve('nonExistentService')
      }).toThrow('Dependency \'nonExistentService\' is not registered')
    })

    it('should handle circular dependency detection', () => {
      // This shouldn't happen with current setup, but test error handling
      const newContainer = new (container.constructor)()

      newContainer.registerSingleton('serviceA', () => {
        return { serviceB: newContainer.resolve('serviceB') }
      })

      newContainer.registerSingleton('serviceB', () => {
        return { serviceA: newContainer.resolve('serviceA') }
      })

      // This will cause a stack overflow, but container should handle gracefully
      expect(() => {
        newContainer.resolve('serviceA')
      }).toThrow()
    })
  })

  describe('Container management', () => {
    it('should support has() method', () => {
      expect(container.has('integrationService')).toBe(true)
      expect(container.has('nonExistentService')).toBe(false)
    })

    it('should support registerInstance', () => {
      const customInstance = { test: 'value' }
      container.registerInstance('customService', customInstance)

      const resolved = container.resolve('customService')
      expect(resolved).toBe(customInstance)
    })

    it('should support registerTransient', () => {
      let counter = 0
      container.registerTransient('transientService', () => {
        return { id: ++counter }
      })

      const instance1 = container.resolve('transientService')
      const instance2 = container.resolve('transientService')

      expect(instance1).not.toBe(instance2)
      expect(instance1.id).toBe(1)
      expect(instance2.id).toBe(2)
    })

    it('should reset container properly', () => {
      container.resolve('integrationService') // Create some instances

      const beforeReset = container.getRegisteredServices()
      container.reset()
      const afterReset = container.getRegisteredServices()

      expect(beforeReset.length).toBeGreaterThan(0)
      expect(afterReset.length).toBeGreaterThan(0)
      expect(afterReset).toEqual(beforeReset) // Should re-register same services
    })

    it('should dispose resources', () => {
      const mockDisposable = {
        dispose: vi.fn()
      }

      container.registerInstance('disposableService', mockDisposable)
      container.resolve('disposableService') // Ensure it's in instances

      container.dispose()

      expect(mockDisposable.dispose).toHaveBeenCalled()
    })

    it('should handle dispose errors gracefully', () => {
      const mockBadDisposable = {
        dispose: vi.fn().mockImplementation(() => {
          throw new Error('Dispose error')
        })
      }

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      container.registerInstance('badDisposable', mockBadDisposable)
      container.resolve('badDisposable')

      expect(() => {
        container.dispose()
      }).not.toThrow()

      expect(consoleSpy).toHaveBeenCalledWith('Error disposing instance:', expect.any(Error))

      consoleSpy.mockRestore()
    })
  })

  describe('Convenience exports', () => {
    it('should provide convenience getter functions', async () => {
      const { getIntegrationService, getProjectService } = await import('../../container.js')

      expect(typeof getIntegrationService).toBe('function')
      expect(typeof getProjectService).toBe('function')

      const integrationService = getIntegrationService()
      const projectService = getProjectService()

      expect(integrationService).toBeInstanceOf(IntegrationService)
      expect(projectService).toBeInstanceOf(ProjectService)
    })
  })

  describe('Integration with real API client', () => {
    it('should wire up real API client properly', () => {
      const apiClient = container.resolve('apiClient')
      const integrationRepo = container.resolve('integrationRepository')

      // Should be the same instance
      expect(integrationRepo.apiClient).toBe(apiClient)

      // Should have real API methods
      expect(typeof apiClient.get).toBe('function')
      expect(typeof apiClient.post).toBe('function')
    })
  })

  describe('Performance', () => {
    it('should resolve dependencies quickly', () => {
      const start = performance.now()

      for (let i = 0; i < 1000; i++) {
        container.resolve('integrationService')
      }

      const end = performance.now()
      const duration = end - start

      // Should resolve 1000 times in less than 100ms
      expect(duration).toBeLessThan(100)
    })

    it('should cache singleton instances efficiently', () => {
      const service1 = container.resolve('integrationService')

      const start = performance.now()

      for (let i = 0; i < 10000; i++) {
        const service = container.resolve('integrationService')
        expect(service).toBe(service1)
      }

      const end = performance.now()
      const duration = end - start

      // Should resolve cached instances very quickly
      expect(duration).toBeLessThan(50)
    })
  })
})