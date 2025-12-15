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

    controller = new FriggAppController({
      connectToFriggAppUseCase: mockConnectUseCase,
      getUserManagementModeUseCase: mockUserModeUseCase,
      manageGlobalEntitiesUseCase: mockGlobalEntitiesUseCase,
      adminApiAdapter: mockAdminApiAdapter
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
})
