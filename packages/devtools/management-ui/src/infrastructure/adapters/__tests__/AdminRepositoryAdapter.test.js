import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AdminRepositoryAdapter } from '../AdminRepositoryAdapter'

describe('AdminRepositoryAdapter', () => {
  let adapter
  let mockApiClient

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn()
    }

    adapter = new AdminRepositoryAdapter(mockApiClient)
  })

  describe('constructor', () => {
    it('should throw error if no apiClient provided', () => {
      expect(() => new AdminRepositoryAdapter()).toThrow('AdminRepositoryAdapter requires an apiClient')
    })

    it('should create adapter with apiClient', () => {
      expect(adapter.api).toBe(mockApiClient)
    })
  })

  describe('listUsers', () => {
    it('should call GET /api/admin/users with default options', async () => {
      const mockResponse = {
        data: {
          users: [],
          pagination: { page: 1, limit: 50, total: 0 }
        }
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.listUsers()

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/admin/users', {
        params: {
          page: 1,
          limit: 50,
          sortBy: 'createdAt',
          sortOrder: 'desc'
        }
      })
      expect(result).toEqual(mockResponse.data)
    })

    it('should call GET /api/admin/users with custom options', async () => {
      const mockResponse = {
        data: {
          users: [],
          pagination: { page: 2, limit: 10, total: 0 }
        }
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      await adapter.listUsers({
        page: 2,
        limit: 10,
        sortBy: 'username',
        sortOrder: 'asc'
      })

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/admin/users', {
        params: {
          page: 2,
          limit: 10,
          sortBy: 'username',
          sortOrder: 'asc'
        }
      })
    })
  })

  describe('searchUsers', () => {
    it('should call GET /api/admin/users/search with query', async () => {
      const mockResponse = {
        data: {
          users: [],
          pagination: { page: 1, limit: 50, total: 0 }
        }
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.searchUsers('testuser')

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/admin/users/search', {
        params: {
          q: 'testuser',
          page: 1,
          limit: 50,
          sortBy: 'createdAt',
          sortOrder: 'desc'
        }
      })
      expect(result).toEqual(mockResponse.data)
    })

    it('should call with custom options', async () => {
      const mockResponse = { data: { users: [], pagination: {} } }
      mockApiClient.get.mockResolvedValue(mockResponse)

      await adapter.searchUsers('testuser', {
        page: 3,
        limit: 25
      })

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/admin/users/search', {
        params: {
          q: 'testuser',
          page: 3,
          limit: 25,
          sortBy: 'createdAt',
          sortOrder: 'desc'
        }
      })
    })
  })

  describe('createUser', () => {
    it('should call POST /api/admin/users', async () => {
      const userData = {
        username: 'newuser',
        password: 'password123',
        email: 'new@test.com'
      }

      const mockResponse = {
        data: {
          user: { _id: '123', ...userData }
        }
      }

      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await adapter.createUser(userData)

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/admin/users', userData)
      expect(result).toEqual(mockResponse.data.user)
    })

    it('should return data directly if no user wrapper', async () => {
      const userData = {
        username: 'newuser',
        password: 'password123'
      }

      const mockResponse = {
        data: { _id: '123', ...userData }
      }

      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await adapter.createUser(userData)

      expect(result).toEqual(mockResponse.data)
    })
  })

  describe('listGlobalEntities', () => {
    it('should call GET /api/admin/global-entities', async () => {
      const mockEntities = [
        { _id: '1', type: 'salesforce' },
        { _id: '2', type: 'hubspot' }
      ]

      const mockResponse = {
        data: { globalEntities: mockEntities }
      }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.listGlobalEntities()

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/admin/global-entities')
      expect(result).toEqual(mockEntities)
    })

    it('should return empty array if no globalEntities in response', async () => {
      mockApiClient.get.mockResolvedValue({ data: {} })

      const result = await adapter.listGlobalEntities()

      expect(result).toEqual([])
    })
  })

  describe('getGlobalEntity', () => {
    it('should call GET /api/admin/global-entities/:id', async () => {
      const mockEntity = { _id: '123', type: 'salesforce' }
      const mockResponse = { data: mockEntity }

      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await adapter.getGlobalEntity('123')

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/admin/global-entities/123')
      expect(result).toEqual(mockEntity)
    })
  })

  describe('createGlobalEntity', () => {
    it('should call POST /api/admin/global-entities', async () => {
      const entityData = {
        entityType: 'salesforce',
        credentials: { username: 'test', password: 'pass' },
        name: 'My Salesforce'
      }

      const mockResponse = {
        data: { _id: '123', ...entityData }
      }

      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await adapter.createGlobalEntity(entityData)

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/admin/global-entities', entityData)
      expect(result).toEqual(mockResponse.data)
    })
  })

  describe('testGlobalEntity', () => {
    it('should call POST /api/admin/global-entities/:id/test', async () => {
      const mockResponse = {
        data: { success: true, message: 'Connection successful' }
      }

      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await adapter.testGlobalEntity('123')

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/admin/global-entities/123/test')
      expect(result).toEqual(mockResponse.data)
    })
  })

  describe('deleteGlobalEntity', () => {
    it('should call DELETE /api/admin/global-entities/:id', async () => {
      const mockResponse = {
        data: { success: true, message: 'Entity deleted' }
      }

      mockApiClient.delete.mockResolvedValue(mockResponse)

      const result = await adapter.deleteGlobalEntity('123')

      expect(mockApiClient.delete).toHaveBeenCalledWith('/api/admin/global-entities/123')
      expect(result).toEqual(mockResponse.data)
    })
  })
})
