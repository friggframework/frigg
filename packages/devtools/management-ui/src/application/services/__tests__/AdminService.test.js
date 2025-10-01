import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AdminService } from '../AdminService'
import { AdminUser } from '../../../domain/entities/AdminUser'
import { GlobalEntity } from '../../../domain/entities/GlobalEntity'

describe('AdminService', () => {
  let adminService
  let mockRepository

  beforeEach(() => {
    mockRepository = {
      listUsers: vi.fn(),
      searchUsers: vi.fn(),
      createUser: vi.fn(),
      listGlobalEntities: vi.fn(),
      getGlobalEntity: vi.fn(),
      createGlobalEntity: vi.fn(),
      testGlobalEntity: vi.fn(),
      deleteGlobalEntity: vi.fn()
    }

    adminService = new AdminService(mockRepository)
  })

  describe('constructor', () => {
    it('should throw error if no repository provided', () => {
      expect(() => new AdminService()).toThrow('AdminService requires an adminRepository')
    })

    it('should create service with repository', () => {
      expect(adminService.adminRepository).toBe(mockRepository)
    })
  })

  describe('listUsers', () => {
    it('should list users with default pagination', async () => {
      const mockData = {
        users: [
          { _id: '1', username: 'user1', email: 'user1@test.com' },
          { _id: '2', username: 'user2', email: 'user2@test.com' }
        ],
        pagination: { page: 1, limit: 50, total: 2 }
      }

      mockRepository.listUsers.mockResolvedValue(mockData)

      const result = await adminService.listUsers()

      expect(mockRepository.listUsers).toHaveBeenCalledWith({
        page: 1,
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      })
      expect(result.users).toHaveLength(2)
      expect(result.users[0]).toBeInstanceOf(AdminUser)
      expect(result.pagination).toEqual(mockData.pagination)
    })

    it('should list users with custom pagination', async () => {
      const mockData = {
        users: [],
        pagination: { page: 2, limit: 10, total: 0 }
      }

      mockRepository.listUsers.mockResolvedValue(mockData)

      await adminService.listUsers({ page: 2, limit: 10 })

      expect(mockRepository.listUsers).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      })
    })
  })

  describe('searchUsers', () => {
    it('should search users with query', async () => {
      const mockData = {
        users: [
          { _id: '1', username: 'testuser', email: 'test@test.com' }
        ],
        pagination: { page: 1, limit: 50, total: 1 }
      }

      mockRepository.searchUsers.mockResolvedValue(mockData)

      const result = await adminService.searchUsers('testuser')

      expect(mockRepository.searchUsers).toHaveBeenCalledWith('testuser', {
        page: 1,
        limit: 50
      })
      expect(result.users).toHaveLength(1)
      expect(result.users[0]).toBeInstanceOf(AdminUser)
      expect(result.query).toBe('testuser')
    })

    it('should throw error if query is empty', async () => {
      await expect(adminService.searchUsers('')).rejects.toThrow('Search query is required')
      await expect(adminService.searchUsers('   ')).rejects.toThrow('Search query is required')
    })

    it('should throw error if query is missing', async () => {
      await expect(adminService.searchUsers()).rejects.toThrow('Search query is required')
    })
  })

  describe('createUser', () => {
    it('should create user with username and password', async () => {
      const mockUser = {
        _id: '123',
        username: 'newuser',
        email: 'new@test.com'
      }

      mockRepository.createUser.mockResolvedValue(mockUser)

      const result = await adminService.createUser({
        username: 'newuser',
        password: 'password123',
        email: 'new@test.com'
      })

      expect(mockRepository.createUser).toHaveBeenCalledWith({
        username: 'newuser',
        password: 'password123',
        email: 'new@test.com'
      })
      expect(result).toBeInstanceOf(AdminUser)
      expect(result.username).toBe('newuser')
    })

    it('should throw error if neither username nor email provided', async () => {
      await expect(
        adminService.createUser({ password: 'password123' })
      ).rejects.toThrow('Username or email is required')
    })

    it('should throw error if password missing', async () => {
      await expect(
        adminService.createUser({ username: 'newuser' })
      ).rejects.toThrow('Password must be at least 8 characters')
    })

    it('should throw error if password too short', async () => {
      await expect(
        adminService.createUser({ username: 'newuser', password: 'short' })
      ).rejects.toThrow('Password must be at least 8 characters')
    })
  })

  describe('listGlobalEntities', () => {
    it('should list global entities', async () => {
      const mockEntities = [
        { _id: '1', type: 'salesforce', status: 'connected', isGlobal: true },
        { _id: '2', type: 'hubspot', status: 'connected', isGlobal: true }
      ]

      mockRepository.listGlobalEntities.mockResolvedValue(mockEntities)

      const result = await adminService.listGlobalEntities()

      expect(mockRepository.listGlobalEntities).toHaveBeenCalled()
      expect(result).toHaveLength(2)
      expect(result[0]).toBeInstanceOf(GlobalEntity)
      expect(result[1]).toBeInstanceOf(GlobalEntity)
    })
  })

  describe('getGlobalEntity', () => {
    it('should get global entity by id', async () => {
      const mockEntity = {
        _id: '123',
        type: 'salesforce',
        status: 'connected',
        isGlobal: true
      }

      mockRepository.getGlobalEntity.mockResolvedValue(mockEntity)

      const result = await adminService.getGlobalEntity('123')

      expect(mockRepository.getGlobalEntity).toHaveBeenCalledWith('123')
      expect(result).toBeInstanceOf(GlobalEntity)
      expect(result.type).toBe('salesforce')
    })

    it('should throw error if id not provided', async () => {
      await expect(adminService.getGlobalEntity()).rejects.toThrow('Entity ID is required')
      await expect(adminService.getGlobalEntity('')).rejects.toThrow('Entity ID is required')
    })
  })

  describe('createGlobalEntity', () => {
    it('should create global entity', async () => {
      const mockEntity = {
        _id: '123',
        type: 'salesforce',
        name: 'My Salesforce',
        status: 'connected',
        isGlobal: true
      }

      mockRepository.createGlobalEntity.mockResolvedValue(mockEntity)

      const result = await adminService.createGlobalEntity({
        entityType: 'salesforce',
        credentials: { username: 'test', password: 'pass' },
        name: 'My Salesforce'
      })

      expect(mockRepository.createGlobalEntity).toHaveBeenCalledWith({
        entityType: 'salesforce',
        credentials: { username: 'test', password: 'pass' },
        name: 'My Salesforce'
      })
      expect(result).toBeInstanceOf(GlobalEntity)
      expect(result.type).toBe('salesforce')
    })

    it('should use default name if not provided', async () => {
      const mockEntity = {
        _id: '123',
        type: 'salesforce',
        status: 'connected',
        isGlobal: true
      }

      mockRepository.createGlobalEntity.mockResolvedValue(mockEntity)

      await adminService.createGlobalEntity({
        entityType: 'salesforce',
        credentials: { username: 'test', password: 'pass' }
      })

      expect(mockRepository.createGlobalEntity).toHaveBeenCalledWith({
        entityType: 'salesforce',
        credentials: { username: 'test', password: 'pass' },
        name: 'Global salesforce'
      })
    })

    it('should throw error if entityType not provided', async () => {
      await expect(
        adminService.createGlobalEntity({ credentials: {} })
      ).rejects.toThrow('Entity type is required')
    })

    it('should throw error if credentials not provided', async () => {
      await expect(
        adminService.createGlobalEntity({ entityType: 'salesforce' })
      ).rejects.toThrow('Credentials are required')
    })

    it('should throw error if credentials empty', async () => {
      await expect(
        adminService.createGlobalEntity({ entityType: 'salesforce', credentials: {} })
      ).rejects.toThrow('Credentials are required')
    })
  })

  describe('testGlobalEntity', () => {
    it('should test global entity connection', async () => {
      mockRepository.testGlobalEntity.mockResolvedValue({
        success: true,
        message: 'Connection successful'
      })

      const result = await adminService.testGlobalEntity('123')

      expect(mockRepository.testGlobalEntity).toHaveBeenCalledWith('123')
      expect(result.success).toBe(true)
    })

    it('should throw error if id not provided', async () => {
      await expect(adminService.testGlobalEntity()).rejects.toThrow('Entity ID is required')
    })
  })

  describe('deleteGlobalEntity', () => {
    it('should delete global entity', async () => {
      mockRepository.deleteGlobalEntity.mockResolvedValue({
        success: true,
        message: 'Entity deleted'
      })

      const result = await adminService.deleteGlobalEntity('123')

      expect(mockRepository.deleteGlobalEntity).toHaveBeenCalledWith('123')
      expect(result.success).toBe(true)
    })

    it('should throw error if id not provided', async () => {
      await expect(adminService.deleteGlobalEntity()).rejects.toThrow('Entity ID is required')
    })
  })

  describe('getAdminStats', () => {
    it('should return admin statistics', async () => {
      mockRepository.listUsers.mockResolvedValue({
        users: [],
        pagination: { total: 42 }
      })

      mockRepository.listGlobalEntities.mockResolvedValue([
        { _id: '1', type: 'salesforce', status: 'connected', isGlobal: true },
        { _id: '2', type: 'hubspot', status: 'error', isGlobal: true },
        { _id: '3', type: 'slack', status: 'connected', isGlobal: true }
      ])

      const result = await adminService.getAdminStats()

      expect(result).toEqual({
        totalUsers: 42,
        totalGlobalEntities: 3,
        connectedGlobalEntities: 2
      })
    })

    it('should handle missing pagination data', async () => {
      mockRepository.listUsers.mockResolvedValue({
        users: []
      })

      mockRepository.listGlobalEntities.mockResolvedValue([])

      const result = await adminService.getAdminStats()

      expect(result.totalUsers).toBe(0)
      expect(result.totalGlobalEntities).toBe(0)
    })
  })
})
