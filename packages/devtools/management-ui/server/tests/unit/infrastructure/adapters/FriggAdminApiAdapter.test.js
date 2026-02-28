/**
 * Unit tests for FriggAdminApiAdapter
 * Infrastructure Layer - Adapter for admin API operations via the Frigg app
 *
 * TDD: Write tests first, then implement the adapter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FriggAdminApiAdapter } from '../../../../src/infrastructure/adapters/FriggAdminApiAdapter.js'

describe('FriggAdminApiAdapter', () => {
  let mockFriggAppAdapter
  let adapter

  beforeEach(() => {
    mockFriggAppAdapter = {
      isConnected: vi.fn().mockReturnValue(true),
      makeRequest: vi.fn(),
      getConnection: vi.fn().mockReturnValue({
        getUserManagementMode: vi.fn().mockReturnValue({
          isFriggTokenEnabled: () => true,
          isSharedSecretEnabled: () => false
        })
      })
    }
    adapter = new FriggAdminApiAdapter({ friggAppAdapter: mockFriggAppAdapter })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should create adapter with FriggAppAdapter dependency', () => {
      expect(adapter).toBeDefined()
    })
  })

  describe('user management', () => {
    describe('listUsers', () => {
      it('should list users with pagination', async () => {
        const mockUsers = {
          users: [
            { id: '1', email: 'user1@test.com' },
            { id: '2', email: 'user2@test.com' }
          ],
          total: 2,
          page: 1,
          limit: 10
        }

        mockFriggAppAdapter.makeRequest.mockResolvedValue(mockUsers)

        const result = await adapter.listUsers({ page: 1, limit: 10 })

        expect(mockFriggAppAdapter.makeRequest).toHaveBeenCalledWith(
          'GET',
          '/api/admin/users',
          { params: { page: 1, limit: 10 } }
        )
        expect(result).toEqual(mockUsers)
      })

      it('should throw when not connected', async () => {
        mockFriggAppAdapter.isConnected.mockReturnValue(false)

        await expect(adapter.listUsers()).rejects.toThrow('Not connected')
      })
    })

    describe('searchUsers', () => {
      it('should search users by query', async () => {
        const mockResult = {
          users: [{ id: '1', email: 'john@test.com' }],
          total: 1
        }

        mockFriggAppAdapter.makeRequest.mockResolvedValue(mockResult)

        const result = await adapter.searchUsers('john', { limit: 20 })

        expect(mockFriggAppAdapter.makeRequest).toHaveBeenCalledWith(
          'GET',
          '/api/admin/users/search',
          { params: { q: 'john', limit: 20 } }
        )
        expect(result).toEqual(mockResult)
      })
    })

    describe('createUser', () => {
      it('should create user with admin privileges', async () => {
        const userData = {
          email: 'newuser@test.com',
          password: 'secret123'
        }

        const mockResponse = {
          id: '123',
          email: 'newuser@test.com'
        }

        mockFriggAppAdapter.makeRequest.mockResolvedValue(mockResponse)

        const result = await adapter.createUser(userData)

        expect(mockFriggAppAdapter.makeRequest).toHaveBeenCalledWith(
          'POST',
          '/api/admin/users',
          userData
        )
        expect(result).toEqual(mockResponse)
      })
    })

    describe('getUser', () => {
      it('should get user by ID', async () => {
        const mockUser = { id: '123', email: 'user@test.com' }

        mockFriggAppAdapter.makeRequest.mockResolvedValue(mockUser)

        const result = await adapter.getUser('123')

        expect(mockFriggAppAdapter.makeRequest).toHaveBeenCalledWith(
          'GET',
          '/api/admin/users/123'
        )
        expect(result).toEqual(mockUser)
      })
    })

    describe('deleteUser', () => {
      it('should handle user deletion', async () => {
        mockFriggAppAdapter.makeRequest.mockResolvedValue({ success: true })

        const result = await adapter.deleteUser('123')

        expect(mockFriggAppAdapter.makeRequest).toHaveBeenCalledWith(
          'DELETE',
          '/api/admin/users/123'
        )
        expect(result.success).toBe(true)
      })
    })

    describe('impersonateUser', () => {
      it('should generate impersonation token', async () => {
        const mockResponse = {
          token: 'impersonation-jwt-token',
          expiresIn: 3600
        }

        mockFriggAppAdapter.makeRequest.mockResolvedValue(mockResponse)

        const result = await adapter.impersonateUser('123')

        expect(mockFriggAppAdapter.makeRequest).toHaveBeenCalledWith(
          'POST',
          '/api/admin/users/123/impersonate'
        )
        expect(result.token).toBeDefined()
      })
    })
  })

  describe('global entities', () => {
    describe('listGlobalEntities', () => {
      it('should list global entities', async () => {
        const mockEntities = {
          entities: [
            { id: '1', type: 'HubSpot', isGlobal: true },
            { id: '2', type: 'Salesforce', isGlobal: true }
          ]
        }

        mockFriggAppAdapter.makeRequest.mockResolvedValue(mockEntities)

        const result = await adapter.listGlobalEntities()

        expect(mockFriggAppAdapter.makeRequest).toHaveBeenCalledWith(
          'GET',
          '/api/admin/entities'
        )
        expect(result).toEqual(mockEntities)
      })

      it('should throw when not connected', async () => {
        mockFriggAppAdapter.isConnected.mockReturnValue(false)

        await expect(adapter.listGlobalEntities()).rejects.toThrow('Not connected')
      })
    })

    describe('getGlobalEntity', () => {
      it('should get entity by ID', async () => {
        const mockEntity = { id: '123', type: 'HubSpot', isGlobal: true }

        mockFriggAppAdapter.makeRequest.mockResolvedValue(mockEntity)

        const result = await adapter.getGlobalEntity('123')

        expect(mockFriggAppAdapter.makeRequest).toHaveBeenCalledWith(
          'GET',
          '/api/admin/entities/123'
        )
        expect(result).toEqual(mockEntity)
      })
    })

    describe('createGlobalEntity', () => {
      it('should create global entity with isGlobal flag', async () => {
        const entityData = {
          type: 'HubSpot',
          credentials: { accessToken: 'token123' }
        }

        const mockResponse = {
          id: '456',
          type: 'HubSpot',
          isGlobal: true
        }

        mockFriggAppAdapter.makeRequest.mockResolvedValue(mockResponse)

        const result = await adapter.createGlobalEntity(entityData)

        expect(mockFriggAppAdapter.makeRequest).toHaveBeenCalledWith(
          'POST',
          '/api/admin/entities',
          expect.objectContaining({
            type: 'HubSpot',
            isGlobal: true
          })
        )
        expect(result.isGlobal).toBe(true)
      })
    })

    describe('updateGlobalEntity', () => {
      it('should update entity', async () => {
        const updates = { credentials: { accessToken: 'newToken' } }
        const mockResponse = { id: '123', type: 'HubSpot', isGlobal: true }

        mockFriggAppAdapter.makeRequest.mockResolvedValue(mockResponse)

        const result = await adapter.updateGlobalEntity('123', updates)

        expect(mockFriggAppAdapter.makeRequest).toHaveBeenCalledWith(
          'PUT',
          '/api/admin/entities/123',
          updates
        )
      })
    })

    describe('deleteGlobalEntity', () => {
      it('should delete entity', async () => {
        mockFriggAppAdapter.makeRequest.mockResolvedValue({ success: true })

        const result = await adapter.deleteGlobalEntity('123')

        expect(mockFriggAppAdapter.makeRequest).toHaveBeenCalledWith(
          'DELETE',
          '/api/admin/entities/123'
        )
        expect(result.success).toBe(true)
      })
    })

    describe('testGlobalEntity', () => {
      it('should test entity connection', async () => {
        const mockResponse = {
          success: true,
          status: 'connected',
          responseTime: 150
        }

        mockFriggAppAdapter.makeRequest.mockResolvedValue(mockResponse)

        const result = await adapter.testGlobalEntity('123')

        expect(mockFriggAppAdapter.makeRequest).toHaveBeenCalledWith(
          'POST',
          '/api/admin/entities/123/test'
        )
        expect(result.success).toBe(true)
        expect(result.status).toBe('connected')
      })
    })
  })

  describe('connection status', () => {
    describe('isConnected', () => {
      it('should delegate to FriggAppAdapter', () => {
        mockFriggAppAdapter.isConnected.mockReturnValue(true)
        expect(adapter.isConnected()).toBe(true)

        mockFriggAppAdapter.isConnected.mockReturnValue(false)
        expect(adapter.isConnected()).toBe(false)
      })
    })

    describe('getUserManagementMode', () => {
      it('should return user management mode from connection', () => {
        const mode = adapter.getUserManagementMode()

        expect(mode.isFriggTokenEnabled()).toBe(true)
        expect(mode.isSharedSecretEnabled()).toBe(false)
      })
    })
  })
})
