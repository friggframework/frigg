/**
 * Unit tests for FriggAppController
 * Presentation Layer - Controller for Frigg app connection and admin API operations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FriggAppController } from '../../../../src/presentation/controllers/FriggAppController.js'

describe('FriggAppController', () => {
  let mockConnectUseCase
  let mockUserModeUseCase
  let mockGlobalEntitiesUseCase
  let mockAdminApiAdapter
  let mockCheckOAuthCredentialsUseCase
  let mockWriteOAuthCredentialsUseCase
  let controller
  let mockReq
  let mockRes

  beforeEach(() => {
    mockConnectUseCase = {
      execute: vi.fn(),
      disconnect: vi.fn(),
      getStatus: vi.fn()
    }

    mockUserModeUseCase = {
      execute: vi.fn(),
      getAvailableAuthMethods: vi.fn()
    }

    mockGlobalEntitiesUseCase = {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      test: vi.fn()
    }

    mockAdminApiAdapter = {
      listUsers: vi.fn(),
      searchUsers: vi.fn(),
      createUser: vi.fn(),
      deleteUser: vi.fn(),
      impersonateUser: vi.fn()
    }

    mockCheckOAuthCredentialsUseCase = {
      execute: vi.fn()
    }

    mockWriteOAuthCredentialsUseCase = {
      execute: vi.fn()
    }

    controller = new FriggAppController({
      connectToFriggAppUseCase: mockConnectUseCase,
      getUserManagementModeUseCase: mockUserModeUseCase,
      manageGlobalEntitiesUseCase: mockGlobalEntitiesUseCase,
      adminApiAdapter: mockAdminApiAdapter,
      checkOAuthCredentialsUseCase: mockCheckOAuthCredentialsUseCase,
      writeOAuthCredentialsUseCase: mockWriteOAuthCredentialsUseCase
    })

    mockReq = {
      body: {},
      params: {},
      query: {}
    }

    mockRes = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis()
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('connect', () => {
    it('should return success with connection details', async () => {
      mockReq.body = {
        friggAppUrl: 'http://localhost:3000',
        adminApiKey: 'test-key'
      }

      mockConnectUseCase.execute.mockResolvedValue({
        success: true,
        connection: { isConnected: true, baseUrl: 'http://localhost:3000' },
        userManagementMode: { friggTokenEnabled: true },
        appDefinition: { name: 'test-app' }
      })

      await controller.connect(mockReq, mockRes)

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        connection: { isConnected: true, baseUrl: 'http://localhost:3000' },
        userManagementMode: { friggTokenEnabled: true },
        appDefinition: { name: 'test-app' }
      })
    })

    it('should return 400 on connection failure', async () => {
      mockReq.body = {
        friggAppUrl: 'invalid-url',
        adminApiKey: ''
      }

      mockConnectUseCase.execute.mockResolvedValue({
        success: false,
        error: 'Invalid URL format'
      })

      await controller.connect(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid URL format'
      })
    })
  })

  describe('disconnect', () => {
    it('should disconnect successfully', async () => {
      await controller.disconnect(mockReq, mockRes)

      expect(mockConnectUseCase.disconnect).toHaveBeenCalled()
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Disconnected from Frigg app'
      })
    })
  })

  describe('getConnectionStatus', () => {
    it('should return connection status', async () => {
      mockConnectUseCase.getStatus.mockReturnValue({
        isConnected: true,
        baseUrl: 'http://localhost:3000',
        state: 'connected'
      })

      await controller.getConnectionStatus(mockReq, mockRes)

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        isConnected: true,
        baseUrl: 'http://localhost:3000',
        state: 'connected'
      })
    })
  })

  describe('getUserManagementMode', () => {
    it('should return user management mode', async () => {
      mockUserModeUseCase.execute.mockResolvedValue({
        success: true,
        mode: {
          friggTokenEnabled: true,
          sharedSecretEnabled: false,
          usePassword: true
        }
      })

      await controller.getUserManagementMode(mockReq, mockRes)

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        mode: {
          friggTokenEnabled: true,
          sharedSecretEnabled: false,
          usePassword: true
        }
      })
    })
  })

  describe('listGlobalEntities', () => {
    it('should return list of global entities', async () => {
      mockGlobalEntitiesUseCase.list.mockResolvedValue({
        success: true,
        entities: [
          { id: '1', type: 'HubSpot', isGlobal: true }
        ]
      })

      await controller.listGlobalEntities(mockReq, mockRes)

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        entities: [{ id: '1', type: 'HubSpot', isGlobal: true }]
      })
    })
  })

  describe('createGlobalEntity', () => {
    it('should create global entity and return 201', async () => {
      mockReq.body = { type: 'HubSpot', credentials: { token: 'abc' } }

      mockGlobalEntitiesUseCase.create.mockResolvedValue({
        success: true,
        entity: { id: '123', type: 'HubSpot', isGlobal: true }
      })

      await controller.createGlobalEntity(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(201)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        entity: { id: '123', type: 'HubSpot', isGlobal: true }
      })
    })
  })

  describe('testGlobalEntity', () => {
    it('should return test results', async () => {
      mockReq.params = { entityId: '123' }

      mockGlobalEntitiesUseCase.test.mockResolvedValue({
        success: true,
        status: 'connected',
        responseTime: 150
      })

      await controller.testGlobalEntity(mockReq, mockRes)

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        status: 'connected',
        responseTime: 150,
        error: undefined
      })
    })
  })

  describe('checkOAuthCredentials', () => {
    it('should return 400 when repositoryPath is missing', async () => {
      mockReq.query = { moduleName: 'hubspot' }

      await controller.checkOAuthCredentials(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'repositoryPath and moduleName are required'
      })
    })

    it('should return 400 when moduleName is missing', async () => {
      mockReq.query = { repositoryPath: '/repo' }

      await controller.checkOAuthCredentials(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'repositoryPath and moduleName are required'
      })
    })

    it('should return credentials status when complete', async () => {
      mockReq.query = { repositoryPath: '/repo', moduleName: 'hubspot' }

      mockCheckOAuthCredentialsUseCase.execute.mockResolvedValue({
        complete: true,
        missing: [],
        hasClientId: true,
        hasClientSecret: true,
        envVarNames: {
          clientId: 'HUBSPOT_CLIENT_ID',
          clientSecret: 'HUBSPOT_CLIENT_SECRET',
          scope: 'HUBSPOT_SCOPE'
        }
      })

      await controller.checkOAuthCredentials(mockReq, mockRes)

      expect(mockCheckOAuthCredentialsUseCase.execute).toHaveBeenCalledWith({
        repositoryPath: '/repo',
        moduleName: 'hubspot'
      })
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        complete: true,
        missing: [],
        hasClientId: true,
        hasClientSecret: true,
        envVarNames: {
          clientId: 'HUBSPOT_CLIENT_ID',
          clientSecret: 'HUBSPOT_CLIENT_SECRET',
          scope: 'HUBSPOT_SCOPE'
        }
      })
    })

    it('should return 500 on use case error', async () => {
      mockReq.query = { repositoryPath: '/repo', moduleName: 'hubspot' }

      mockCheckOAuthCredentialsUseCase.execute.mockRejectedValue(
        new Error('File system error')
      )

      await controller.checkOAuthCredentials(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'File system error'
      })
    })
  })

  describe('writeOAuthCredentials', () => {
    it('should return 400 when repositoryPath is missing', async () => {
      mockReq.body = {
        moduleName: 'hubspot',
        credentials: { clientId: 'id', clientSecret: 'secret' }
      }

      await controller.writeOAuthCredentials(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'repositoryPath, moduleName, and credentials are required'
      })
    })

    it('should return 400 when moduleName is missing', async () => {
      mockReq.body = {
        repositoryPath: '/repo',
        credentials: { clientId: 'id', clientSecret: 'secret' }
      }

      await controller.writeOAuthCredentials(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'repositoryPath, moduleName, and credentials are required'
      })
    })

    it('should return 400 when credentials are missing', async () => {
      mockReq.body = {
        repositoryPath: '/repo',
        moduleName: 'hubspot'
      }

      await controller.writeOAuthCredentials(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'repositoryPath, moduleName, and credentials are required'
      })
    })

    it('should return success result from use case', async () => {
      mockReq.body = {
        repositoryPath: '/repo',
        moduleName: 'hubspot',
        credentials: { clientId: 'id', clientSecret: 'secret' }
      }

      mockWriteOAuthCredentialsUseCase.execute.mockResolvedValue({
        success: true,
        path: '/repo/backend/.env',
        written: {
          HUBSPOT_CLIENT_ID: true,
          HUBSPOT_CLIENT_SECRET: true,
          HUBSPOT_SCOPE: false
        },
        requiresReload: true
      })

      await controller.writeOAuthCredentials(mockReq, mockRes)

      expect(mockWriteOAuthCredentialsUseCase.execute).toHaveBeenCalledWith({
        repositoryPath: '/repo',
        moduleName: 'hubspot',
        credentials: { clientId: 'id', clientSecret: 'secret' }
      })
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        path: '/repo/backend/.env',
        written: {
          HUBSPOT_CLIENT_ID: true,
          HUBSPOT_CLIENT_SECRET: true,
          HUBSPOT_SCOPE: false
        },
        requiresReload: true
      })
    })

    it('should return 400 for validation errors', async () => {
      mockReq.body = {
        repositoryPath: '/repo',
        moduleName: 'hubspot',
        credentials: { clientId: 'id', clientSecret: 'secret' }
      }

      mockWriteOAuthCredentialsUseCase.execute.mockRejectedValue(
        new Error('Client ID is required and must be a string')
      )

      await controller.writeOAuthCredentials(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Client ID is required and must be a string'
      })
    })

    it('should return 500 for non-validation errors', async () => {
      mockReq.body = {
        repositoryPath: '/repo',
        moduleName: 'hubspot',
        credentials: { clientId: 'id', clientSecret: 'secret' }
      }

      mockWriteOAuthCredentialsUseCase.execute.mockRejectedValue(
        new Error('Permission denied')
      )

      await controller.writeOAuthCredentials(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Permission denied'
      })
    })
  })
})
