/**
 * Unit tests for ManageGlobalEntitiesUseCase
 * Application Layer - Use case for admin-only global entity management
 *
 * TDD: Write tests first, then implement the use case
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ManageGlobalEntitiesUseCase } from '../../../../../src/application/use-cases/frigg-app/ManageGlobalEntitiesUseCase.js'

describe('ManageGlobalEntitiesUseCase', () => {
  let mockAdminApiAdapter
  let useCase

  beforeEach(() => {
    mockAdminApiAdapter = {
      isConnected: vi.fn().mockReturnValue(true),
      listGlobalEntities: vi.fn(),
      getGlobalEntity: vi.fn(),
      createGlobalEntity: vi.fn(),
      updateGlobalEntity: vi.fn(),
      deleteGlobalEntity: vi.fn(),
      testGlobalEntity: vi.fn()
    }

    useCase = new ManageGlobalEntitiesUseCase({
      adminApiAdapter: mockAdminApiAdapter
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('list', () => {
    it('should list all global entities', async () => {
      const mockEntities = {
        entities: [
          { id: '1', type: 'HubSpot', isGlobal: true },
          { id: '2', type: 'Salesforce', isGlobal: true }
        ]
      }

      mockAdminApiAdapter.listGlobalEntities.mockResolvedValue(mockEntities)

      const result = await useCase.list()

      expect(result.success).toBe(true)
      expect(result.entities).toHaveLength(2)
      expect(result.entities[0].type).toBe('HubSpot')
    })

    it('should require connection', async () => {
      mockAdminApiAdapter.isConnected.mockReturnValue(false)

      const result = await useCase.list()

      expect(result.success).toBe(false)
      expect(result.error).toContain('Not connected')
    })

    it('should handle API errors', async () => {
      mockAdminApiAdapter.listGlobalEntities.mockRejectedValue(new Error('Network error'))

      const result = await useCase.list()

      expect(result.success).toBe(false)
      expect(result.error).toContain('Network error')
    })
  })

  describe('get', () => {
    it('should get a specific global entity', async () => {
      const mockEntity = { id: '123', type: 'HubSpot', isGlobal: true }

      mockAdminApiAdapter.getGlobalEntity.mockResolvedValue(mockEntity)

      const result = await useCase.get('123')

      expect(result.success).toBe(true)
      expect(result.entity).toEqual(mockEntity)
    })

    it('should validate entity ID', async () => {
      const result = await useCase.get('')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Entity ID is required')
    })
  })

  describe('create', () => {
    it('should create a new global entity', async () => {
      const entityData = {
        type: 'HubSpot',
        credentials: { accessToken: 'token123' }
      }

      const mockResponse = {
        id: '456',
        type: 'HubSpot',
        isGlobal: true
      }

      mockAdminApiAdapter.createGlobalEntity.mockResolvedValue(mockResponse)

      const result = await useCase.create(entityData)

      expect(result.success).toBe(true)
      expect(result.entity.id).toBe('456')
      expect(mockAdminApiAdapter.createGlobalEntity).toHaveBeenCalledWith(entityData)
    })

    it('should validate entity type is provided', async () => {
      const result = await useCase.create({ credentials: {} })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Entity type is required')
    })

    it('should require connection', async () => {
      mockAdminApiAdapter.isConnected.mockReturnValue(false)

      const result = await useCase.create({ type: 'HubSpot' })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Not connected')
    })
  })

  describe('update', () => {
    it('should update an existing global entity', async () => {
      const updates = { credentials: { accessToken: 'newToken' } }
      const mockResponse = { id: '123', type: 'HubSpot', isGlobal: true }

      mockAdminApiAdapter.updateGlobalEntity.mockResolvedValue(mockResponse)

      const result = await useCase.update('123', updates)

      expect(result.success).toBe(true)
      expect(mockAdminApiAdapter.updateGlobalEntity).toHaveBeenCalledWith('123', updates)
    })

    it('should validate entity ID', async () => {
      const result = await useCase.update('', { credentials: {} })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Entity ID is required')
    })
  })

  describe('delete', () => {
    it('should delete a global entity', async () => {
      mockAdminApiAdapter.deleteGlobalEntity.mockResolvedValue({ success: true })

      const result = await useCase.delete('123')

      expect(result.success).toBe(true)
      expect(mockAdminApiAdapter.deleteGlobalEntity).toHaveBeenCalledWith('123')
    })

    it('should validate entity ID', async () => {
      const result = await useCase.delete('')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Entity ID is required')
    })
  })

  describe('test', () => {
    it('should test entity connection', async () => {
      const mockResponse = {
        success: true,
        status: 'connected',
        responseTime: 150
      }

      mockAdminApiAdapter.testGlobalEntity.mockResolvedValue(mockResponse)

      const result = await useCase.test('123')

      expect(result.success).toBe(true)
      expect(result.status).toBe('connected')
      expect(result.responseTime).toBe(150)
    })

    it('should handle test failures', async () => {
      const mockResponse = {
        success: false,
        status: 'failed',
        error: 'Invalid credentials'
      }

      mockAdminApiAdapter.testGlobalEntity.mockResolvedValue(mockResponse)

      const result = await useCase.test('123')

      expect(result.success).toBe(false)
      expect(result.status).toBe('failed')
    })
  })
})
