/**
 * IntegrationRepositoryAdapter Infrastructure Layer Tests
 * Testing API integration and data transformation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IntegrationRepositoryAdapter } from '../../infrastructure/adapters/IntegrationRepositoryAdapter.js'

// Mock API client
const mockApiClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn()
}

describe('IntegrationRepositoryAdapter Infrastructure Layer', () => {
  let adapter

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Create adapter with mock API client
    adapter = new IntegrationRepositoryAdapter(mockApiClient)
  })

  describe('getAll', () => {
    it('should fetch all integrations successfully', async () => {
      const mockResponse = {
        data: {
          data: {
            integrations: [
              { name: 'salesforce', type: 'api', status: 'active' },
              { name: 'github', type: 'git', status: 'inactive' }
            ]
          }
        }
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.getAll()

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/integrations')
      expect(result).toEqual(mockResponse.data.data.integrations)
    })

    it('should handle direct data response format', async () => {
      const mockResponse = {
        data: {
          integrations: [
            { name: 'slack', type: 'webhook', status: 'active' }
          ]
        }
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.getAll()

      expect(result).toEqual(mockResponse.data.integrations)
    })

    it('should return empty array when no integrations', async () => {
      const mockResponse = {
        data: {
          data: {}
        }
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.getAll()

      expect(result).toEqual([])
    })

    it('should handle API errors', async () => {
      const apiError = new Error('API request failed')
      mockApiClient.get.mockRejectedValue(apiError)

      await expect(adapter.getAll()).rejects.toThrow('Failed to fetch integrations: API request failed')
    })

    it('should handle network timeout', async () => {
      const timeoutError = new Error('Network timeout')
      mockApiClient.get.mockRejectedValue(timeoutError)

      await expect(adapter.getAll()).rejects.toThrow('Failed to fetch integrations: Network timeout')
    })
  })

  describe('getByName', () => {
    it('should return integration by name when found', async () => {
      const mockIntegrations = [
        { name: 'salesforce', type: 'api', status: 'active' },
        { name: 'github', type: 'git', status: 'inactive' }
      ]

      const mockResponse = {
        data: {
          data: {
            integrations: mockIntegrations
          }
        }
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.getByName('salesforce')

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/integrations')
      expect(result).toEqual(mockIntegrations[0])
    })

    it('should return null when integration not found', async () => {
      const mockResponse = {
        data: {
          data: {
            integrations: [
              { name: 'github', type: 'git', status: 'inactive' }
            ]
          }
        }
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.getByName('salesforce')

      expect(result).toBeNull()
    })

    it('should handle API errors', async () => {
      const apiError = new Error('API request failed')
      mockApiClient.get.mockRejectedValue(apiError)

      await expect(adapter.getByName('salesforce')).rejects.toThrow('Failed to fetch integration \'salesforce\': API request failed')
    })
  })

  describe('install', () => {
    it('should install integration successfully', async () => {
      const mockIntegration = { name: 'salesforce', type: 'api', status: 'active' }
      const mockResponse = {
        data: {
          data: {
            integration: mockIntegration
          }
        }
      }

      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await adapter.install('salesforce')

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/integrations/install', { name: 'salesforce' })
      expect(result).toEqual(mockIntegration)
    })

    it('should handle direct integration response format', async () => {
      const mockIntegration = { name: 'slack', type: 'webhook', status: 'active' }
      const mockResponse = {
        data: mockIntegration
      }

      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await adapter.install('slack')

      expect(result).toEqual(mockIntegration)
    })

    it('should handle installation errors', async () => {
      const installError = new Error('Installation failed')
      mockApiClient.post.mockRejectedValue(installError)

      await expect(adapter.install('salesforce')).rejects.toThrow('Failed to install integration \'salesforce\': Installation failed')
    })

    it('should handle validation errors', async () => {
      const validationError = new Error('Invalid integration name')
      mockApiClient.post.mockRejectedValue(validationError)

      await expect(adapter.install('invalid-name')).rejects.toThrow('Failed to install integration \'invalid-name\': Invalid integration name')
    })
  })

  describe('uninstall', () => {
    it('should uninstall integration successfully', async () => {
      mockApiClient.delete.mockResolvedValue({})

      const result = await adapter.uninstall('salesforce')

      expect(mockApiClient.delete).toHaveBeenCalledWith('/api/integrations/salesforce')
      expect(result).toBe(true)
    })

    it('should handle uninstallation errors', async () => {
      const uninstallError = new Error('Uninstallation failed')
      mockApiClient.delete.mockRejectedValue(uninstallError)

      await expect(adapter.uninstall('salesforce')).rejects.toThrow('Failed to uninstall integration \'salesforce\': Uninstallation failed')
    })

    it('should handle not found errors', async () => {
      const notFoundError = new Error('Integration not found')
      mockApiClient.delete.mockRejectedValue(notFoundError)

      await expect(adapter.uninstall('nonexistent')).rejects.toThrow('Failed to uninstall integration \'nonexistent\': Integration not found')
    })
  })

  describe('updateConfig', () => {
    it('should update configuration successfully', async () => {
      const mockConfig = { apiKey: 'new-key', timeout: 5000 }
      const mockIntegration = { name: 'salesforce', config: mockConfig }
      const mockResponse = {
        data: {
          data: {
            integration: mockIntegration
          }
        }
      }

      mockApiClient.put.mockResolvedValue(mockResponse)

      const result = await adapter.updateConfig('salesforce', mockConfig)

      expect(mockApiClient.put).toHaveBeenCalledWith('/api/integrations/salesforce/config', { config: mockConfig })
      expect(result).toEqual(mockIntegration)
    })

    it('should handle direct integration response format', async () => {
      const mockConfig = { webhookUrl: 'https://example.com/webhook' }
      const mockIntegration = { name: 'slack', config: mockConfig }
      const mockResponse = {
        data: mockIntegration
      }

      mockApiClient.put.mockResolvedValue(mockResponse)

      const result = await adapter.updateConfig('slack', mockConfig)

      expect(result).toEqual(mockIntegration)
    })

    it('should handle config update errors', async () => {
      const configError = new Error('Config validation failed')
      mockApiClient.put.mockRejectedValue(configError)

      await expect(adapter.updateConfig('salesforce', { invalid: 'config' })).rejects.toThrow('Failed to update integration config for \'salesforce\': Config validation failed')
    })

    it('should handle complex configuration objects', async () => {
      const complexConfig = {
        authentication: {
          type: 'oauth2',
          clientId: 'client123',
          scopes: ['read', 'write']
        },
        settings: {
          timeout: 30000,
          retries: 3
        }
      }

      const mockResponse = {
        data: {
          data: {
            integration: { name: 'salesforce', config: complexConfig }
          }
        }
      }

      mockApiClient.put.mockResolvedValue(mockResponse)

      const result = await adapter.updateConfig('salesforce', complexConfig)

      expect(mockApiClient.put).toHaveBeenCalledWith('/api/integrations/salesforce/config', { config: complexConfig })
      expect(result.config).toEqual(complexConfig)
    })
  })

  describe('checkConnection', () => {
    it('should return true for successful connection', async () => {
      const mockResponse = {
        data: {
          data: {
            connected: true
          }
        }
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.checkConnection('salesforce')

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/integrations/salesforce/check')
      expect(result).toBe(true)
    })

    it('should return false for failed connection', async () => {
      const mockResponse = {
        data: {
          data: {
            connected: false
          }
        }
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.checkConnection('salesforce')

      expect(result).toBe(false)
    })

    it('should handle direct response format', async () => {
      const mockResponse = {
        data: {
          connected: true
        }
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.checkConnection('github')

      expect(result).toBe(true)
    })

    it('should handle connection check errors', async () => {
      const connectionError = new Error('Connection check failed')
      mockApiClient.get.mockRejectedValue(connectionError)

      await expect(adapter.checkConnection('salesforce')).rejects.toThrow('Failed to check integration connection for \'salesforce\': Connection check failed')
    })

    it('should handle malformed responses', async () => {
      const mockResponse = {
        data: {
          data: {
            status: 'unknown'
          }
        }
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.checkConnection('salesforce')

      expect(result).toBe(false)
    })
  })

  describe('error handling', () => {
    it('should handle HTTP 404 errors', async () => {
      const notFoundError = new Error('Not found')
      notFoundError.status = 404
      mockApiClient.get.mockRejectedValue(notFoundError)

      await expect(adapter.getAll()).rejects.toThrow('Failed to fetch integrations: Not found')
    })

    it('should handle HTTP 500 errors', async () => {
      const serverError = new Error('Internal server error')
      serverError.status = 500
      mockApiClient.get.mockRejectedValue(serverError)

      await expect(adapter.getAll()).rejects.toThrow('Failed to fetch integrations: Internal server error')
    })

    it('should handle network errors', async () => {
      const networkError = new Error('ECONNREFUSED')
      mockApiClient.get.mockRejectedValue(networkError)

      await expect(adapter.getAll()).rejects.toThrow('Failed to fetch integrations: ECONNREFUSED')
    })

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Request timeout')
      mockApiClient.post.mockRejectedValue(timeoutError)

      await expect(adapter.install('salesforce')).rejects.toThrow('Failed to install integration \'salesforce\': Request timeout')
    })
  })

  describe('data transformation', () => {
    it('should handle missing data gracefully', async () => {
      const mockResponse = {
        data: null
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.getAll()

      expect(result).toEqual([])
    })

    it('should handle empty response', async () => {
      const mockResponse = {
        data: {}
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.getAll()

      expect(result).toEqual([])
    })

    it('should preserve integration data structure', async () => {
      const mockIntegration = {
        name: 'salesforce',
        displayName: 'Salesforce CRM',
        type: 'api',
        status: 'active',
        version: '1.0.0',
        config: { apiKey: 'key123' },
        metadata: { lastUpdated: '2024-01-01' }
      }

      const mockResponse = {
        data: {
          data: {
            integrations: [mockIntegration]
          }
        }
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.getAll()

      expect(result[0]).toEqual(mockIntegration)
      expect(result[0]).toHaveProperty('name')
      expect(result[0]).toHaveProperty('displayName')
      expect(result[0]).toHaveProperty('config')
      expect(result[0]).toHaveProperty('metadata')
    })
  })
})