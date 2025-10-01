/**
 * ProjectRepositoryAdapter Infrastructure Layer Tests
 * Testing API integration and data transformation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ProjectRepositoryAdapter } from '../../infrastructure/adapters/ProjectRepositoryAdapter.js'

// Mock API client
const mockApiClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn()
}

describe('ProjectRepositoryAdapter Infrastructure Layer', () => {
  let adapter

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Create adapter with mock API client
    adapter = new ProjectRepositoryAdapter(mockApiClient)
  })

  describe('getStatus', () => {
    it('should fetch project status successfully', async () => {
      const mockStatus = {
        id: 'test-project',
        name: 'Test Project',
        status: 'running',
        port: 3000,
        path: '/path/to/project'
      }

      const mockResponse = {
        data: {
          data: mockStatus
        }
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.getStatus()

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/project/status')
      expect(result).toEqual(mockStatus)
    })

    it('should handle direct response format', async () => {
      const mockStatus = {
        status: 'stopped',
        port: null,
        integrations: []
      }

      const mockResponse = {
        data: mockStatus
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.getStatus()

      expect(result).toEqual(mockStatus)
    })

    it('should handle API errors', async () => {
      const apiError = new Error('API request failed')
      mockApiClient.get.mockRejectedValue(apiError)

      await expect(adapter.getStatus()).rejects.toThrow('Failed to get project status: API request failed')
    })

    it('should handle missing project gracefully', async () => {
      const mockResponse = {
        data: {
          data: null
        }
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.getStatus()

      expect(result).toBeNull()
    })
  })

  describe('start', () => {
    it('should start project successfully with default options', async () => {
      const mockProject = {
        id: 'test-project',
        status: 'running',
        port: 3000
      }

      const mockResponse = {
        data: {
          data: mockProject
        }
      }

      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await adapter.start()

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/project/start', {})
      expect(result).toEqual(mockProject)
    })

    it('should start project with custom options', async () => {
      const options = {
        port: 4000,
        environment: 'development',
        debug: true
      }

      const mockProject = {
        id: 'test-project',
        status: 'running',
        port: 4000
      }

      const mockResponse = {
        data: {
          data: mockProject
        }
      }

      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await adapter.start(options)

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/project/start', options)
      expect(result).toEqual(mockProject)
    })

    it('should handle direct response format', async () => {
      const mockProject = {
        status: 'running',
        port: 3000
      }

      const mockResponse = {
        data: mockProject
      }

      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await adapter.start()

      expect(result).toEqual(mockProject)
    })

    it('should handle start errors', async () => {
      const startError = new Error('Port already in use')
      mockApiClient.post.mockRejectedValue(startError)

      await expect(adapter.start()).rejects.toThrow('Failed to start project: Port already in use')
    })

    it('should handle validation errors', async () => {
      const validationError = new Error('Invalid port number')
      mockApiClient.post.mockRejectedValue(validationError)

      await expect(adapter.start({ port: 'invalid' })).rejects.toThrow('Failed to start project: Invalid port number')
    })
  })

  describe('stop', () => {
    it('should stop project successfully with default options', async () => {
      const mockProject = {
        id: 'test-project',
        status: 'stopped',
        port: null
      }

      const mockResponse = {
        data: {
          data: mockProject
        }
      }

      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await adapter.stop()

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/project/stop', {})
      expect(result).toEqual(mockProject)
    })

    it('should stop project with graceful shutdown', async () => {
      const options = {
        graceful: true,
        timeout: 5000
      }

      const mockProject = {
        id: 'test-project',
        status: 'stopped',
        port: null
      }

      const mockResponse = {
        data: {
          data: mockProject
        }
      }

      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await adapter.stop(options)

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/project/stop', options)
      expect(result).toEqual(mockProject)
    })

    it('should handle stop errors', async () => {
      const stopError = new Error('Process still running')
      mockApiClient.post.mockRejectedValue(stopError)

      await expect(adapter.stop()).rejects.toThrow('Failed to stop project: Process still running')
    })

    it('should handle already stopped project', async () => {
      const alreadyStoppedError = new Error('Project is not running')
      mockApiClient.post.mockRejectedValue(alreadyStoppedError)

      await expect(adapter.stop()).rejects.toThrow('Failed to stop project: Project is not running')
    })
  })

  describe('restart', () => {
    it('should restart project successfully', async () => {
      const mockProject = {
        id: 'test-project',
        status: 'running',
        port: 3000
      }

      const mockResponse = {
        data: {
          data: mockProject
        }
      }

      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await adapter.restart()

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/project/restart', {})
      expect(result).toEqual(mockProject)
    })

    it('should restart project with options', async () => {
      const options = {
        port: 4000,
        clearCache: true,
        timeout: 10000
      }

      const mockProject = {
        id: 'test-project',
        status: 'running',
        port: 4000
      }

      const mockResponse = {
        data: {
          data: mockProject
        }
      }

      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await adapter.restart(options)

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/project/restart', options)
      expect(result).toEqual(mockProject)
    })

    it('should handle restart errors', async () => {
      const restartError = new Error('Failed to restart')
      mockApiClient.post.mockRejectedValue(restartError)

      await expect(adapter.restart()).rejects.toThrow('Failed to restart project: Failed to restart')
    })
  })

  describe('getConfig', () => {
    it('should fetch project configuration successfully', async () => {
      const mockConfig = {
        port: 3000,
        environment: 'development',
        integrations: ['salesforce', 'github'],
        debug: true,
        database: {
          host: 'localhost',
          port: 5432
        }
      }

      const mockResponse = {
        data: {
          data: mockConfig
        }
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.getConfig()

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/project/config')
      expect(result).toEqual(mockConfig)
    })

    it('should handle direct response format', async () => {
      const mockConfig = {
        port: 3000,
        debug: false
      }

      const mockResponse = {
        data: mockConfig
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.getConfig()

      expect(result).toEqual(mockConfig)
    })

    it('should handle empty configuration', async () => {
      const mockResponse = {
        data: {
          data: {}
        }
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.getConfig()

      expect(result).toEqual({})
    })

    it('should handle config fetch errors', async () => {
      const configError = new Error('Config file not found')
      mockApiClient.get.mockRejectedValue(configError)

      await expect(adapter.getConfig()).rejects.toThrow('Failed to get project config: Config file not found')
    })
  })

  describe('updateConfig', () => {
    it('should update configuration successfully', async () => {
      const newConfig = {
        port: 4000,
        environment: 'production',
        debug: false
      }

      const mockProject = {
        id: 'test-project',
        config: newConfig
      }

      const mockResponse = {
        data: {
          data: mockProject
        }
      }

      mockApiClient.put.mockResolvedValue(mockResponse)

      const result = await adapter.updateConfig(newConfig)

      expect(mockApiClient.put).toHaveBeenCalledWith('/api/project/config', newConfig)
      expect(result).toEqual(mockProject)
    })

    it('should handle partial config updates', async () => {
      const partialConfig = {
        debug: true,
        newSetting: 'value'
      }

      const mockProject = {
        id: 'test-project',
        config: {
          port: 3000,
          environment: 'development',
          debug: true,
          newSetting: 'value'
        }
      }

      const mockResponse = {
        data: {
          data: mockProject
        }
      }

      mockApiClient.put.mockResolvedValue(mockResponse)

      const result = await adapter.updateConfig(partialConfig)

      expect(mockApiClient.put).toHaveBeenCalledWith('/api/project/config', partialConfig)
      expect(result).toEqual(mockProject)
    })

    it('should handle complex configuration objects', async () => {
      const complexConfig = {
        database: {
          host: 'db.example.com',
          port: 5432,
          ssl: true,
          pool: {
            min: 2,
            max: 10
          }
        },
        api: {
          timeout: 30000,
          retries: 3,
          endpoints: ['endpoint1', 'endpoint2']
        }
      }

      const mockProject = {
        id: 'test-project',
        config: complexConfig
      }

      const mockResponse = {
        data: {
          data: mockProject
        }
      }

      mockApiClient.put.mockResolvedValue(mockResponse)

      const result = await adapter.updateConfig(complexConfig)

      expect(mockApiClient.put).toHaveBeenCalledWith('/api/project/config', complexConfig)
      expect(result.config).toEqual(complexConfig)
    })

    it('should handle config update errors', async () => {
      const configError = new Error('Invalid configuration')
      mockApiClient.put.mockRejectedValue(configError)

      await expect(adapter.updateConfig({ invalid: 'config' })).rejects.toThrow('Failed to update project config: Invalid configuration')
    })

    it('should handle validation errors', async () => {
      const validationError = new Error('Port must be a number')
      mockApiClient.put.mockRejectedValue(validationError)

      await expect(adapter.updateConfig({ port: 'invalid' })).rejects.toThrow('Failed to update project config: Port must be a number')
    })
  })

  describe('error handling', () => {
    it('should handle HTTP 404 errors', async () => {
      const notFoundError = new Error('Project not found')
      notFoundError.status = 404
      mockApiClient.get.mockRejectedValue(notFoundError)

      await expect(adapter.getStatus()).rejects.toThrow('Failed to get project status: Project not found')
    })

    it('should handle HTTP 500 errors', async () => {
      const serverError = new Error('Internal server error')
      serverError.status = 500
      mockApiClient.post.mockRejectedValue(serverError)

      await expect(adapter.start()).rejects.toThrow('Failed to start project: Internal server error')
    })

    it('should handle network errors', async () => {
      const networkError = new Error('ECONNREFUSED')
      mockApiClient.get.mockRejectedValue(networkError)

      await expect(adapter.getStatus()).rejects.toThrow('Failed to get project status: ECONNREFUSED')
    })

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Request timeout')
      mockApiClient.post.mockRejectedValue(timeoutError)

      await expect(adapter.start()).rejects.toThrow('Failed to start project: Request timeout')
    })
  })

  describe('data transformation', () => {
    it('should handle missing data gracefully', async () => {
      const mockResponse = {
        data: null
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.getStatus()

      expect(result).toBeNull()
    })

    it('should handle empty response', async () => {
      const mockResponse = {
        data: {}
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.getConfig()

      expect(result).toEqual({})
    })

    it('should preserve project data structure', async () => {
      const mockProject = {
        id: 'complex-project',
        name: 'Complex Project',
        status: 'running',
        port: 3000,
        path: '/path/to/project',
        environment: 'development',
        integrations: ['salesforce', 'github'],
        config: {
          debug: true,
          timeout: 5000
        },
        metadata: {
          created: '2024-01-01',
          lastModified: '2024-01-02'
        }
      }

      const mockResponse = {
        data: {
          data: mockProject
        }
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.getStatus()

      expect(result).toEqual(mockProject)
      expect(result).toHaveProperty('id')
      expect(result).toHaveProperty('name')
      expect(result).toHaveProperty('config')
      expect(result).toHaveProperty('metadata')
      expect(result.config).toEqual(mockProject.config)
      expect(result.metadata).toEqual(mockProject.metadata)
    })
  })

  describe('concurrent operations', () => {
    it('should handle multiple status requests', async () => {
      const mockStatus = { status: 'running', port: 3000 }
      const mockResponse = { data: { data: mockStatus } }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const promises = Array(5).fill(null).map(() => adapter.getStatus())
      const results = await Promise.all(promises)

      expect(mockApiClient.get).toHaveBeenCalledTimes(5)
      results.forEach(result => {
        expect(result).toEqual(mockStatus)
      })
    })

    it('should handle rapid start/stop calls', async () => {
      const startResponse = { data: { data: { status: 'running' } } }
      const stopResponse = { data: { data: { status: 'stopped' } } }

      mockApiClient.post
        .mockResolvedValueOnce(startResponse)
        .mockResolvedValueOnce(stopResponse)

      const startPromise = adapter.start()
      const stopPromise = adapter.stop()

      const [startResult, stopResult] = await Promise.all([startPromise, stopPromise])

      expect(startResult.status).toBe('running')
      expect(stopResult.status).toBe('stopped')
    })
  })
})