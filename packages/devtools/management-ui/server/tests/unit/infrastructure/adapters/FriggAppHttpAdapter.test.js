/**
 * Unit tests for FriggAppHttpAdapter
 * Infrastructure Layer - Adapter for communicating with running Frigg app via HTTP
 *
 * TDD: Write tests first, then implement the adapter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FriggAppHttpAdapter } from '../../../../src/infrastructure/adapters/FriggAppHttpAdapter.js'
import { AdminApiConfig } from '../../../../src/domain/value-objects/AdminApiConfig.js'
import { FriggAppConnection } from '../../../../src/domain/value-objects/FriggAppConnection.js'
import { UserManagementMode } from '../../../../src/domain/value-objects/UserManagementMode.js'

describe('FriggAppHttpAdapter', () => {
  let mockHttpClient
  let adapter

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn()
    }
    adapter = new FriggAppHttpAdapter({ httpClient: mockHttpClient })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should create adapter with http client', () => {
      expect(adapter).toBeDefined()
      expect(adapter.getConnection().getState()).toBe('disconnected')
    })

    it('should start in disconnected state', () => {
      expect(adapter.isConnected()).toBe(false)
    })
  })

  describe('connect', () => {
    const config = new AdminApiConfig({
      baseUrl: 'http://localhost:3000',
      apiKey: 'test-api-key'
    })

    it('should successfully connect to healthy Frigg app', async () => {
      mockHttpClient.get.mockImplementation((url) => {
        if (url === 'http://localhost:3000/health') {
          return Promise.resolve({
            data: { status: 'healthy', responseTime: 50 }
          })
        }
        if (url === 'http://localhost:3000/api/config') {
          return Promise.resolve({
            data: {
              name: 'test-app',
              user: {
                authModes: {
                  friggToken: { enabled: true },
                  sharedSecret: { enabled: false }
                },
                usePassword: true,
                primary: 'individual'
              }
            }
          })
        }
        return Promise.reject(new Error('Unknown URL'))
      })

      const connection = await adapter.connect(config)

      expect(connection.isConnected()).toBe(true)
      expect(connection.isHealthy()).toBe(true)
      expect(connection.getBaseUrl()).toBe('http://localhost:3000')
    })

    it('should set X-API-Key header for requests', async () => {
      mockHttpClient.get.mockResolvedValue({
        data: { status: 'healthy' }
      })

      await adapter.connect(config)

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key'
          })
        })
      )
    })

    it('should cache app definition after successful connection', async () => {
      const appDefinition = {
        name: 'test-app',
        user: {
          authModes: { friggToken: { enabled: true } }
        }
      }

      mockHttpClient.get.mockImplementation((url) => {
        if (url.includes('/health')) {
          return Promise.resolve({ data: { status: 'healthy' } })
        }
        if (url.includes('/api/config')) {
          return Promise.resolve({ data: appDefinition })
        }
      })

      await adapter.connect(config)

      const connection = adapter.getConnection()
      expect(connection.getAppDefinition()).toEqual(appDefinition)
    })

    it('should return error state on connection failure', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('Connection refused'))

      const connection = await adapter.connect(config)

      expect(connection.isConnected()).toBe(false)
      expect(connection.getState()).toBe('error')
      expect(connection.getErrorMessage()).toContain('Connection refused')
    })

    it('should return error state on unhealthy response', async () => {
      mockHttpClient.get.mockResolvedValue({
        data: { status: 'unhealthy', error: 'Database down' }
      })

      const connection = await adapter.connect(config)

      expect(connection.isConnected()).toBe(false)
      expect(connection.getState()).toBe('error')
    })
  })

  describe('disconnect', () => {
    it('should reset connection state', async () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key'
      })

      mockHttpClient.get.mockResolvedValue({
        data: { status: 'healthy' }
      })

      await adapter.connect(config)
      expect(adapter.isConnected()).toBe(true)

      adapter.disconnect()
      expect(adapter.isConnected()).toBe(false)
      expect(adapter.getConnection().getState()).toBe('disconnected')
    })
  })

  describe('checkHealth', () => {
    it('should call /health endpoint', async () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key'
      })

      mockHttpClient.get.mockResolvedValue({
        data: { status: 'healthy', responseTime: 50 }
      })

      await adapter.connect(config)
      const health = await adapter.checkHealth()

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'http://localhost:3000/health',
        expect.any(Object)
      )
      expect(health.status).toBe('healthy')
    })

    it('should update connection state based on response', async () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key'
      })

      // First connect successfully
      mockHttpClient.get.mockResolvedValueOnce({
        data: { status: 'healthy' }
      }).mockResolvedValueOnce({
        data: { name: 'test-app' }
      })

      await adapter.connect(config)
      expect(adapter.getConnection().isHealthy()).toBe(true)

      // Then health check returns unhealthy
      mockHttpClient.get.mockResolvedValue({
        data: { status: 'unhealthy', error: 'Database down' }
      })

      await adapter.checkHealth()
      expect(adapter.getConnection().isHealthy()).toBe(false)
    })

    it('should throw when not connected', async () => {
      await expect(adapter.checkHealth()).rejects.toThrow('Not connected')
    })
  })

  describe('getAppDefinition', () => {
    it('should return cached app definition', async () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key'
      })

      const appDefinition = {
        name: 'my-app',
        user: {
          authModes: { friggToken: { enabled: true } },
          usePassword: true
        }
      }

      mockHttpClient.get.mockImplementation((url) => {
        if (url.includes('/health')) {
          return Promise.resolve({ data: { status: 'healthy' } })
        }
        if (url.includes('/api/config')) {
          return Promise.resolve({ data: appDefinition })
        }
      })

      await adapter.connect(config)
      const result = await adapter.getAppDefinition()

      expect(result).toEqual(appDefinition)
    })

    it('should throw when not connected', async () => {
      await expect(adapter.getAppDefinition()).rejects.toThrow('Not connected')
    })
  })

  describe('getUserConfig', () => {
    it('should return user config from app definition', async () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key'
      })

      const appDefinition = {
        name: 'my-app',
        user: {
          authModes: {
            friggToken: { enabled: true },
            sharedSecret: { enabled: true }
          },
          usePassword: true,
          primary: 'individual',
          individualUserRequired: true,
          organizationUserRequired: false
        }
      }

      mockHttpClient.get.mockImplementation((url) => {
        if (url.includes('/health')) {
          return Promise.resolve({ data: { status: 'healthy' } })
        }
        if (url.includes('/api/config')) {
          return Promise.resolve({ data: appDefinition })
        }
      })

      await adapter.connect(config)
      const userConfig = await adapter.getUserConfig()

      expect(userConfig).toEqual(appDefinition.user)
    })
  })

  describe('getConnection', () => {
    it('should return current connection state', () => {
      const connection = adapter.getConnection()

      expect(connection).toBeInstanceOf(FriggAppConnection)
    })

    it('should return updated connection after connect', async () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key'
      })

      mockHttpClient.get.mockImplementation((url) => {
        if (url.includes('/health')) {
          return Promise.resolve({ data: { status: 'healthy' } })
        }
        if (url.includes('/api/config')) {
          return Promise.resolve({ data: { name: 'test' } })
        }
      })

      const beforeConnect = adapter.getConnection()
      expect(beforeConnect.isConnected()).toBe(false)

      await adapter.connect(config)

      const afterConnect = adapter.getConnection()
      expect(afterConnect.isConnected()).toBe(true)
    })
  })

  describe('isConnected', () => {
    it('should return false initially', () => {
      expect(adapter.isConnected()).toBe(false)
    })

    it('should return true after successful connection', async () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key'
      })

      mockHttpClient.get.mockResolvedValue({
        data: { status: 'healthy' }
      })

      await adapter.connect(config)
      expect(adapter.isConnected()).toBe(true)
    })
  })

  describe('makeRequest', () => {
    it('should make authenticated request to the Frigg app', async () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key'
      })

      mockHttpClient.get.mockResolvedValue({
        data: { status: 'healthy' }
      })

      await adapter.connect(config)

      mockHttpClient.get.mockResolvedValue({
        data: { users: [] }
      })

      const response = await adapter.makeRequest('GET', '/api/admin/users')

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/users',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test-key'
          })
        })
      )
    })

    it('should support POST requests with data', async () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key'
      })

      mockHttpClient.get.mockResolvedValue({
        data: { status: 'healthy' }
      })

      await adapter.connect(config)

      mockHttpClient.post.mockResolvedValue({
        data: { id: '123', email: 'user@test.com' }
      })

      const userData = { email: 'user@test.com', password: 'secret' }
      const response = await adapter.makeRequest('POST', '/api/admin/users', userData)

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/users',
        userData,
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test-key'
          })
        })
      )
    })

    it('should throw when not connected', async () => {
      await expect(adapter.makeRequest('GET', '/api/admin/users')).rejects.toThrow('Not connected')
    })
  })
})
