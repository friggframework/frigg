/**
 * Unit tests for ConnectToFriggAppUseCase
 * Application Layer - Use case for establishing connection to a running Frigg app
 *
 * TDD: Write tests first, then implement the use case
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ConnectToFriggAppUseCase } from '../../../../../src/application/use-cases/frigg-app/ConnectToFriggAppUseCase.js'
import { AdminApiConfig } from '../../../../../src/domain/value-objects/AdminApiConfig.js'
import { FriggAppConnection } from '../../../../../src/domain/value-objects/FriggAppConnection.js'
import { UserManagementMode } from '../../../../../src/domain/value-objects/UserManagementMode.js'

describe('ConnectToFriggAppUseCase', () => {
  let mockFriggAppAdapter
  let mockSettingsRepository
  let useCase

  beforeEach(() => {
    mockFriggAppAdapter = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      getConnection: vi.fn(),
      isConnected: vi.fn()
    }

    mockSettingsRepository = {
      get: vi.fn(),
      set: vi.fn()
    }

    useCase = new ConnectToFriggAppUseCase({
      friggAppAdapter: mockFriggAppAdapter,
      settingsRepository: mockSettingsRepository
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('execute', () => {
    it('should validate url format before connecting', async () => {
      const result = await useCase.execute({
        friggAppUrl: 'not-a-url',
        adminApiKey: 'test-key'
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid')
      expect(mockFriggAppAdapter.connect).not.toHaveBeenCalled()
    })

    it('should validate api key is provided', async () => {
      const result = await useCase.execute({
        friggAppUrl: 'http://localhost:3000',
        adminApiKey: ''
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('API key')
    })

    it('should establish connection and retrieve user config', async () => {
      const mockUserMode = new UserManagementMode({
        enabledModes: ['friggToken', 'sharedSecret'],
        primaryUserType: 'individual',
        individualRequired: true,
        organizationRequired: false,
        usePassword: true
      })

      const mockConnection = FriggAppConnection.connected({
        config: new AdminApiConfig({
          baseUrl: 'http://localhost:3000',
          apiKey: 'test-key'
        }),
        healthStatus: { status: 'healthy', responseTime: 50 },
        userManagementMode: mockUserMode,
        appDefinition: { name: 'test-app' }
      })

      mockFriggAppAdapter.connect.mockResolvedValue(mockConnection)

      const result = await useCase.execute({
        friggAppUrl: 'http://localhost:3000',
        adminApiKey: 'test-key'
      })

      expect(result.success).toBe(true)
      expect(result.connection).toBeDefined()
      expect(result.connection.isConnected).toBe(true)
      expect(result.userManagementMode).toBeDefined()
      expect(result.userManagementMode.friggTokenEnabled).toBe(true)
    })

    it('should handle connection failures gracefully', async () => {
      const mockConnection = FriggAppConnection.error(
        new AdminApiConfig({
          baseUrl: 'http://localhost:3000',
          apiKey: 'test-key'
        }),
        'Connection refused'
      )

      mockFriggAppAdapter.connect.mockResolvedValue(mockConnection)

      const result = await useCase.execute({
        friggAppUrl: 'http://localhost:3000',
        adminApiKey: 'test-key'
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection refused')
    })

    it('should cache successful connection settings', async () => {
      const mockConnection = FriggAppConnection.connected({
        config: new AdminApiConfig({
          baseUrl: 'http://localhost:3000',
          apiKey: 'test-key'
        }),
        healthStatus: { status: 'healthy' },
        userManagementMode: UserManagementMode.fromAppDefinition({}),
        appDefinition: { name: 'test-app' }
      })

      mockFriggAppAdapter.connect.mockResolvedValue(mockConnection)

      await useCase.execute({
        friggAppUrl: 'http://localhost:3000',
        adminApiKey: 'test-key'
      })

      expect(mockSettingsRepository.set).toHaveBeenCalledWith(
        'friggAppConnection',
        expect.objectContaining({
          baseUrl: 'http://localhost:3000'
        })
      )
    })

    it('should use cached settings when reconnecting', async () => {
      mockSettingsRepository.get.mockResolvedValue({
        baseUrl: 'http://localhost:3000',
        apiKey: 'cached-key'
      })

      const mockConnection = FriggAppConnection.connected({
        config: new AdminApiConfig({
          baseUrl: 'http://localhost:3000',
          apiKey: 'cached-key'
        }),
        healthStatus: { status: 'healthy' },
        userManagementMode: UserManagementMode.fromAppDefinition({}),
        appDefinition: { name: 'test-app' }
      })

      mockFriggAppAdapter.connect.mockResolvedValue(mockConnection)

      const result = await useCase.execute({})

      expect(mockFriggAppAdapter.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          _baseUrl: 'http://localhost:3000',
          _apiKey: 'cached-key'
        })
      )
    })

    it('should return error when no cached settings and no params provided', async () => {
      mockSettingsRepository.get.mockResolvedValue(null)

      const result = await useCase.execute({})

      expect(result.success).toBe(false)
      expect(result.error).toContain('No connection settings')
    })
  })

  describe('disconnect', () => {
    it('should disconnect from Frigg app', async () => {
      await useCase.disconnect()

      expect(mockFriggAppAdapter.disconnect).toHaveBeenCalled()
    })
  })

  describe('getStatus', () => {
    it('should return current connection status', () => {
      const mockConnection = FriggAppConnection.connected({
        config: new AdminApiConfig({
          baseUrl: 'http://localhost:3000',
          apiKey: 'test-key'
        }),
        healthStatus: { status: 'healthy' },
        userManagementMode: UserManagementMode.fromAppDefinition({}),
        appDefinition: { name: 'test-app' }
      })

      mockFriggAppAdapter.getConnection.mockReturnValue(mockConnection)
      mockFriggAppAdapter.isConnected.mockReturnValue(true)

      const status = useCase.getStatus()

      expect(status.isConnected).toBe(true)
      expect(status.baseUrl).toBe('http://localhost:3000')
    })

    it('should return disconnected status when not connected', () => {
      mockFriggAppAdapter.getConnection.mockReturnValue(FriggAppConnection.disconnected())
      mockFriggAppAdapter.isConnected.mockReturnValue(false)

      const status = useCase.getStatus()

      expect(status.isConnected).toBe(false)
    })
  })
})
