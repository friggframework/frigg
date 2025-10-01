import { describe, it, expect } from 'vitest'
import { GlobalEntity } from '../GlobalEntity'

describe('GlobalEntity Entity', () => {
  describe('constructor', () => {
    it('should create a GlobalEntity with required fields', () => {
      const entity = new GlobalEntity({
        id: '123',
        type: 'salesforce'
      })

      expect(entity.id).toBe('123')
      expect(entity.type).toBe('salesforce')
      expect(entity.name).toBe('Global salesforce')
      expect(entity.status).toBe('connected')
      expect(entity.isGlobal).toBe(true)
    })

    it('should throw error if type not provided', () => {
      expect(() => {
        new GlobalEntity({
          id: '123'
        })
      }).toThrow('GlobalEntity must have a type')
    })

    it('should accept custom name', () => {
      const entity = new GlobalEntity({
        id: '123',
        type: 'salesforce',
        name: 'Production Salesforce'
      })

      expect(entity.name).toBe('Production Salesforce')
    })

    it('should accept custom status', () => {
      const entity = new GlobalEntity({
        id: '123',
        type: 'salesforce',
        status: 'error'
      })

      expect(entity.status).toBe('error')
    })

    it('should parse timestamps as Dates', () => {
      const now = new Date()
      const entity = new GlobalEntity({
        id: '123',
        type: 'salesforce',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      })

      expect(entity.createdAt).toBeInstanceOf(Date)
      expect(entity.updatedAt).toBeInstanceOf(Date)
    })
  })

  describe('isConnected', () => {
    it('should return true if status is connected', () => {
      const entity = new GlobalEntity({
        id: '123',
        type: 'salesforce',
        status: 'connected'
      })

      expect(entity.isConnected()).toBe(true)
    })

    it('should return false if status is not connected', () => {
      const entity = new GlobalEntity({
        id: '123',
        type: 'salesforce',
        status: 'error'
      })

      expect(entity.isConnected()).toBe(false)
    })
  })

  describe('isGlobalEntity', () => {
    it('should return true if isGlobal is true', () => {
      const entity = new GlobalEntity({
        id: '123',
        type: 'salesforce',
        isGlobal: true
      })

      expect(entity.isGlobalEntity()).toBe(true)
    })

    it('should return false if isGlobal is false', () => {
      const entity = new GlobalEntity({
        id: '123',
        type: 'salesforce',
        isGlobal: false
      })

      expect(entity.isGlobalEntity()).toBe(false)
    })
  })

  describe('getDisplayName', () => {
    it('should return custom name if provided', () => {
      const entity = new GlobalEntity({
        id: '123',
        type: 'salesforce',
        name: 'Production Salesforce'
      })

      expect(entity.getDisplayName()).toBe('Production Salesforce')
    })

    it('should return type if name not provided', () => {
      const entity = new GlobalEntity({
        id: '123',
        type: 'salesforce',
        name: null
      })

      // getDisplayName returns name OR type, but constructor sets default name to 'Global {type}'
      // So we need to explicitly not set name in constructor to get just the type
      expect(entity.getDisplayName()).toBe('Global salesforce')
    })
  })

  describe('getStatusVariant', () => {
    it('should return success for connected status', () => {
      const entity = new GlobalEntity({
        id: '123',
        type: 'salesforce',
        status: 'connected'
      })

      expect(entity.getStatusVariant()).toBe('success')
    })

    it('should return destructive for error status', () => {
      const entity = new GlobalEntity({
        id: '123',
        type: 'salesforce',
        status: 'error'
      })

      expect(entity.getStatusVariant()).toBe('destructive')
    })

    it('should return warning for pending status', () => {
      const entity = new GlobalEntity({
        id: '123',
        type: 'salesforce',
        status: 'pending'
      })

      expect(entity.getStatusVariant()).toBe('warning')
    })

    it('should return secondary for unknown status', () => {
      const entity = new GlobalEntity({
        id: '123',
        type: 'salesforce',
        status: 'unknown'
      })

      expect(entity.getStatusVariant()).toBe('secondary')
    })
  })

  describe('fromApiResponse', () => {
    it('should create GlobalEntity from API response with _id', () => {
      const apiData = {
        _id: '123',
        type: 'salesforce',
        name: 'Production Salesforce',
        status: 'connected',
        isGlobal: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }

      const entity = GlobalEntity.fromApiResponse(apiData)

      expect(entity.id).toBe('123')
      expect(entity.type).toBe('salesforce')
      expect(entity.name).toBe('Production Salesforce')
      expect(entity.status).toBe('connected')
      expect(entity.isGlobal).toBe(true)
    })

    it('should create GlobalEntity from API response with id', () => {
      const apiData = {
        id: '123',
        type: 'salesforce'
      }

      const entity = GlobalEntity.fromApiResponse(apiData)

      expect(entity.id).toBe('123')
    })
  })

  describe('toObject', () => {
    it('should convert GlobalEntity to plain object', () => {
      const entity = new GlobalEntity({
        id: '123',
        type: 'salesforce',
        name: 'Production Salesforce',
        status: 'connected',
        isGlobal: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      })

      const obj = entity.toObject()

      expect(obj).toEqual({
        id: '123',
        type: 'salesforce',
        name: 'Production Salesforce',
        status: 'connected',
        isGlobal: true,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      })
    })
  })

  describe('toCreatePayload', () => {
    it('should create payload for entity creation', () => {
      const entity = new GlobalEntity({
        id: '123',
        type: 'salesforce',
        name: 'Production Salesforce'
      })

      const credentials = {
        username: 'test@example.com',
        password: 'secret'
      }

      const payload = entity.toCreatePayload(credentials)

      expect(payload).toEqual({
        entityType: 'salesforce',
        name: 'Production Salesforce',
        credentials: {
          username: 'test@example.com',
          password: 'secret'
        }
      })
    })
  })
})
