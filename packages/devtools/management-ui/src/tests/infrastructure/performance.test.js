/**
 * DDD Performance Tests
 * Testing performance characteristics of DDD layers
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import container from '../../container.js'
import { IntegrationService } from '../../application/services/IntegrationService.js'
import { ProjectService } from '../../application/services/ProjectService.js'

// Mock API client for performance tests
vi.mock('../../services/api.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}))

describe('DDD Performance Tests', () => {
  let mockApiClient

  beforeEach(async () => {
    container.reset()

    const apiModule = await import('../../services/api.js')
    mockApiClient = apiModule.default
    vi.clearAllMocks()
  })

  describe('Container Performance', () => {
    it('should resolve services quickly', () => {
      const start = performance.now()

      for (let i = 0; i < 1000; i++) {
        container.resolve('integrationService')
      }

      const end = performance.now()
      const duration = end - start

      // Should resolve 1000 times in less than 50ms
      expect(duration).toBeLessThan(50)
    })

    it('should maintain singleton performance', () => {
      const service1 = container.resolve('integrationService')

      const start = performance.now()

      for (let i = 0; i < 10000; i++) {
        const service = container.resolve('integrationService')
        expect(service).toBe(service1)
      }

      const end = performance.now()
      const duration = end - start

      // Should resolve cached instances in less than 25ms
      expect(duration).toBeLessThan(25)
    })

    it('should handle concurrent service resolution efficiently', async () => {
      const start = performance.now()

      const promises = Array(100).fill(null).map(() =>
        Promise.resolve(container.resolve('integrationService'))
      )

      const results = await Promise.all(promises)

      const end = performance.now()
      const duration = end - start

      // All should be same instance
      const firstService = results[0]
      results.forEach(service => {
        expect(service).toBe(firstService)
      })

      // Should complete in less than 10ms
      expect(duration).toBeLessThan(10)
    })

    it('should not have memory leaks with repeated service resolution', () => {
      const initialMemory = process.memoryUsage().heapUsed

      for (let i = 0; i < 10000; i++) {
        container.resolve('integrationService')
        container.resolve('projectService')
        container.resolve('userService')
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory

      // Memory increase should be minimal (less than 5MB)
      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024)
    })
  })

  describe('Service Layer Performance', () => {
    it('should handle rapid API calls efficiently', async () => {
      // Setup mock response
      const mockIntegrations = Array(100).fill(null).map((_, i) => ({
        name: `integration-${i}`,
        type: 'api',
        status: 'active'
      }))

      mockApiClient.get.mockResolvedValue({
        data: { data: { integrations: mockIntegrations } }
      })

      const integrationService = container.resolve('integrationService')

      const start = performance.now()

      // Make 50 concurrent API calls
      const promises = Array(50).fill(null).map(() =>
        integrationService.listIntegrations()
      )

      const results = await Promise.all(promises)

      const end = performance.now()
      const duration = end - start

      // All should return same data
      results.forEach(result => {
        expect(result).toHaveLength(100)
      })

      // Should complete in reasonable time (less than 100ms)
      expect(duration).toBeLessThan(100)
    })

    it('should handle large datasets efficiently', async () => {
      // Create large dataset
      const largeDataset = Array(10000).fill(null).map((_, i) => ({
        name: `integration-${i}`,
        displayName: `Integration ${i}`,
        type: 'api',
        status: i % 2 === 0 ? 'active' : 'inactive',
        description: `Description for integration ${i}`,
        config: {
          apiKey: `key-${i}`,
          timeout: 5000 + i,
          settings: {
            retries: 3,
            batchSize: 100
          }
        },
        metadata: {
          created: new Date().toISOString(),
          tags: [`tag-${i % 10}`, `category-${i % 5}`],
          author: `user-${i % 20}`
        }
      }))

      mockApiClient.get.mockResolvedValue({
        data: { data: { integrations: largeDataset } }
      })

      const integrationService = container.resolve('integrationService')

      const start = performance.now()
      const result = await integrationService.listIntegrations()
      const end = performance.now()

      const duration = end - start

      expect(result).toHaveLength(10000)

      // Should handle large dataset in reasonable time (less than 50ms)
      expect(duration).toBeLessThan(50)
    })

    it('should maintain performance with complex object graphs', async () => {
      const complexConfig = {
        authentication: {
          type: 'oauth2',
          credentials: {
            clientId: 'client123',
            clientSecret: 'secret456',
            scopes: Array(100).fill(null).map((_, i) => `scope-${i}`)
          },
          endpoints: {
            authorize: 'https://auth.example.com/oauth/authorize',
            token: 'https://auth.example.com/oauth/token',
            refresh: 'https://auth.example.com/oauth/refresh'
          }
        },
        api: {
          baseUrl: 'https://api.example.com',
          version: 'v2',
          endpoints: Object.fromEntries(
            Array(500).fill(null).map((_, i) => [`endpoint-${i}`, {
              path: `/api/v2/endpoint-${i}`,
              method: 'GET',
              timeout: 30000,
              retries: 3
            }])
          )
        },
        features: {
          webhooks: {
            enabled: true,
            endpoints: Array(50).fill(null).map((_, i) => ({
              name: `webhook-${i}`,
              url: `https://webhook.example.com/endpoint-${i}`,
              events: [`event-${i}`, `event-${i + 1}`]
            }))
          },
          batch: {
            enabled: true,
            maxSize: 1000,
            timeout: 60000
          }
        }
      }

      mockApiClient.put.mockResolvedValue({
        data: { data: { integration: { name: 'complex', config: complexConfig } } }
      })

      const integrationService = container.resolve('integrationService')

      const start = performance.now()
      await integrationService.updateIntegrationConfig('complex', complexConfig)
      const end = performance.now()

      const duration = end - start

      // Should handle complex objects efficiently (less than 25ms)
      expect(duration).toBeLessThan(25)
    })
  })

  describe('Error Handling Performance', () => {
    it('should handle errors efficiently without performance degradation', async () => {
      mockApiClient.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: { data: { integrations: [] } } })

      const integrationService = container.resolve('integrationService')

      const start = performance.now()

      // First call should fail quickly
      try {
        await integrationService.listIntegrations()
      } catch (error) {
        expect(error.message).toContain('Network error')
      }

      // Second call should succeed
      const result = await integrationService.listIntegrations()

      const end = performance.now()
      const duration = end - start

      expect(result).toEqual([])

      // Error handling shouldn't add significant overhead (less than 20ms)
      expect(duration).toBeLessThan(20)
    })

    it('should recover from errors without memory leaks', async () => {
      const initialMemory = process.memoryUsage().heapUsed

      mockApiClient.get.mockImplementation(() => {
        throw new Error('Simulated error')
      })

      const integrationService = container.resolve('integrationService')

      // Trigger many errors
      for (let i = 0; i < 1000; i++) {
        try {
          await integrationService.listIntegrations()
        } catch (error) {
          // Expected to fail
        }
      }

      if (global.gc) {
        global.gc()
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory

      // Error handling shouldn't cause memory leaks (less than 2MB)
      expect(memoryIncrease).toBeLessThan(2 * 1024 * 1024)
    })
  })

  describe('Repository Layer Performance', () => {
    it('should handle API transformations efficiently', async () => {
      const rawData = {
        data: {
          data: {
            integrations: Array(1000).fill(null).map((_, i) => ({
              name: `integration-${i}`,
              displayName: `Integration ${i}`,
              type: 'api',
              status: 'active',
              version: '1.0.0',
              modules: [`module-${i}-1`, `module-${i}-2`],
              config: { key: `value-${i}` },
              options: { option: `option-${i}` },
              metadata: { meta: `meta-${i}` }
            }))
          }
        }
      }

      mockApiClient.get.mockResolvedValue(rawData)

      const integrationRepo = container.resolve('integrationRepository')

      const start = performance.now()
      const result = await integrationRepo.getAll()
      const end = performance.now()

      const duration = end - start

      expect(result).toHaveLength(1000)

      // Data transformation should be fast (less than 10ms)
      expect(duration).toBeLessThan(10)
    })
  })

  describe('Use Case Performance', () => {
    it('should execute use cases efficiently', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { data: { integrations: [] } }
      })

      const integrationService = container.resolve('integrationService')

      const start = performance.now()

      // Execute use case many times
      for (let i = 0; i < 100; i++) {
        await integrationService.listIntegrations()
      }

      const end = performance.now()
      const duration = end - start

      // 100 use case executions should be fast (less than 100ms)
      expect(duration).toBeLessThan(100)
    })
  })

  describe('Stress Testing', () => {
    it('should handle high load without degradation', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { data: { integrations: [] } }
      })
      mockApiClient.post.mockResolvedValue({
        data: { data: { integration: { name: 'test', status: 'active' } } }
      })

      const integrationService = container.resolve('integrationService')
      const projectService = container.resolve('projectService')

      const start = performance.now()

      // Simulate high load with mixed operations
      const promises = []

      for (let i = 0; i < 200; i++) {
        if (i % 4 === 0) {
          promises.push(integrationService.listIntegrations())
        } else if (i % 4 === 1) {
          promises.push(integrationService.installIntegration(`test-${i}`))
        } else if (i % 4 === 2) {
          promises.push(projectService.getProjectStatus())
        } else {
          promises.push(container.resolve('userService'))
        }
      }

      await Promise.all(promises)

      const end = performance.now()
      const duration = end - start

      // High load should complete in reasonable time (less than 500ms)
      expect(duration).toBeLessThan(500)
    })

    it('should maintain consistent performance over time', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { data: { integrations: [] } }
      })

      const integrationService = container.resolve('integrationService')
      const measurements = []

      // Take multiple measurements
      for (let round = 0; round < 10; round++) {
        const start = performance.now()

        for (let i = 0; i < 100; i++) {
          await integrationService.listIntegrations()
        }

        const end = performance.now()
        measurements.push(end - start)
      }

      // Calculate performance statistics
      const average = measurements.reduce((a, b) => a + b, 0) / measurements.length
      const variance = measurements.reduce((acc, val) => acc + Math.pow(val - average, 2), 0) / measurements.length
      const standardDeviation = Math.sqrt(variance)

      // Performance should be consistent (low standard deviation)
      expect(standardDeviation).toBeLessThan(average * 0.2) // Less than 20% variation

      // Average performance should be good
      expect(average).toBeLessThan(100)
    })
  })
})