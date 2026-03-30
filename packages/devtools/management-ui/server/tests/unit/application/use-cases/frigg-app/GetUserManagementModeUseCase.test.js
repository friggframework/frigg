/**
 * Unit tests for GetUserManagementModeUseCase
 * Application Layer - Use case for detecting which user management mode is active
 *
 * TDD: Write tests first, then implement the use case
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GetUserManagementModeUseCase } from '../../../../../src/application/use-cases/frigg-app/GetUserManagementModeUseCase.js'
import { FriggAppConnection } from '../../../../../src/domain/value-objects/FriggAppConnection.js'
import { UserManagementMode } from '../../../../../src/domain/value-objects/UserManagementMode.js'
import { AdminApiConfig } from '../../../../../src/domain/value-objects/AdminApiConfig.js'

describe('GetUserManagementModeUseCase', () => {
  let mockFriggAppAdapter
  let useCase

  beforeEach(() => {
    mockFriggAppAdapter = {
      isConnected: vi.fn(),
      getConnection: vi.fn()
    }

    useCase = new GetUserManagementModeUseCase({
      friggAppAdapter: mockFriggAppAdapter
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('execute', () => {
    it('should return user management mode from connected app', async () => {
      const userMode = new UserManagementMode({
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
        healthStatus: { status: 'healthy' },
        userManagementMode: userMode,
        appDefinition: { name: 'test-app' }
      })

      mockFriggAppAdapter.isConnected.mockReturnValue(true)
      mockFriggAppAdapter.getConnection.mockReturnValue(mockConnection)

      const result = await useCase.execute()

      expect(result.success).toBe(true)
      expect(result.mode).toBeDefined()
      expect(result.mode.friggTokenEnabled).toBe(true)
      expect(result.mode.sharedSecretEnabled).toBe(true)
      expect(result.mode.adopterJwtEnabled).toBe(false)
      expect(result.mode.usePassword).toBe(true)
      expect(result.mode.primaryUserType).toBe('individual')
    })

    it('should return error when not connected', async () => {
      mockFriggAppAdapter.isConnected.mockReturnValue(false)
      mockFriggAppAdapter.getConnection.mockReturnValue(FriggAppConnection.disconnected())

      const result = await useCase.execute()

      expect(result.success).toBe(false)
      expect(result.error).toContain('Not connected')
    })

    it('should return all auth mode flags', async () => {
      const userMode = new UserManagementMode({
        enabledModes: ['friggToken', 'sharedSecret', 'adopterJwt'],
        primaryUserType: 'organization',
        individualRequired: false,
        organizationRequired: true,
        usePassword: false
      })

      const mockConnection = FriggAppConnection.connected({
        config: new AdminApiConfig({
          baseUrl: 'http://localhost:3000',
          apiKey: 'test-key'
        }),
        healthStatus: { status: 'healthy' },
        userManagementMode: userMode,
        appDefinition: { name: 'test-app' }
      })

      mockFriggAppAdapter.isConnected.mockReturnValue(true)
      mockFriggAppAdapter.getConnection.mockReturnValue(mockConnection)

      const result = await useCase.execute()

      expect(result.success).toBe(true)
      expect(result.mode.friggTokenEnabled).toBe(true)
      expect(result.mode.sharedSecretEnabled).toBe(true)
      expect(result.mode.adopterJwtEnabled).toBe(true)
      expect(result.mode.primaryUserType).toBe('organization')
    })

    it('should return primary mode correctly', async () => {
      const userMode = new UserManagementMode({
        enabledModes: ['sharedSecret'],
        primaryUserType: 'individual',
        individualRequired: true,
        organizationRequired: false,
        usePassword: false
      })

      const mockConnection = FriggAppConnection.connected({
        config: new AdminApiConfig({
          baseUrl: 'http://localhost:3000',
          apiKey: 'test-key'
        }),
        healthStatus: { status: 'healthy' },
        userManagementMode: userMode,
        appDefinition: { name: 'test-app' }
      })

      mockFriggAppAdapter.isConnected.mockReturnValue(true)
      mockFriggAppAdapter.getConnection.mockReturnValue(mockConnection)

      const result = await useCase.execute()

      expect(result.success).toBe(true)
      expect(result.mode.enabledModes).toContain('sharedSecret')
      expect(result.mode.friggTokenEnabled).toBe(false)
      expect(result.mode.sharedSecretEnabled).toBe(true)
    })
  })

  describe('getAvailableAuthMethods', () => {
    it('should return list of available authentication methods', async () => {
      const userMode = new UserManagementMode({
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
        healthStatus: { status: 'healthy' },
        userManagementMode: userMode,
        appDefinition: { name: 'test-app' }
      })

      mockFriggAppAdapter.isConnected.mockReturnValue(true)
      mockFriggAppAdapter.getConnection.mockReturnValue(mockConnection)

      const methods = useCase.getAvailableAuthMethods()

      expect(methods).toEqual([
        {
          id: 'friggToken',
          label: 'Username/Password',
          description: 'Authenticate with email and password via /user/login',
          enabled: true
        },
        {
          id: 'sharedSecret',
          label: 'API Headers',
          description: 'Authenticate using x-frigg-appuserid and x-frigg-apporgid headers',
          enabled: true
        },
        {
          id: 'adopterJwt',
          label: 'JWT Token',
          description: 'Authenticate using adopter-provided JWT token',
          enabled: false
        }
      ])
    })

    it('should return empty array when not connected', () => {
      mockFriggAppAdapter.isConnected.mockReturnValue(false)
      mockFriggAppAdapter.getConnection.mockReturnValue(FriggAppConnection.disconnected())

      const methods = useCase.getAvailableAuthMethods()

      expect(methods).toEqual([])
    })
  })
})
