import { describe, it, expect } from 'vitest'
import { AdminUser } from '../AdminUser'

describe('AdminUser Entity', () => {
  describe('constructor', () => {
    it('should create an AdminUser with username', () => {
      const user = new AdminUser({
        id: '123',
        username: 'testuser',
        email: null
      })

      expect(user.id).toBe('123')
      expect(user.username).toBe('testuser')
      expect(user.email).toBe(null)
    })

    it('should create an AdminUser with email', () => {
      const user = new AdminUser({
        id: '123',
        username: null,
        email: 'test@example.com'
      })

      expect(user.id).toBe('123')
      expect(user.email).toBe('test@example.com')
      expect(user.username).toBe(null)
    })

    it('should create an AdminUser with both username and email', () => {
      const user = new AdminUser({
        id: '123',
        username: 'testuser',
        email: 'test@example.com'
      })

      expect(user.username).toBe('testuser')
      expect(user.email).toBe('test@example.com')
    })

    it('should throw error if neither username nor email provided', () => {
      expect(() => {
        new AdminUser({
          id: '123',
          username: null,
          email: null
        })
      }).toThrow('AdminUser must have either username or email')
    })

    it('should set organization data', () => {
      const user = new AdminUser({
        id: '123',
        username: 'testuser',
        email: 'test@example.com',
        organizationUserId: 'org-456',
        organizationName: 'Test Org'
      })

      expect(user.organizationUserId).toBe('org-456')
      expect(user.organizationName).toBe('Test Org')
    })

    it('should parse createdAt as Date', () => {
      const now = new Date()
      const user = new AdminUser({
        id: '123',
        username: 'testuser',
        createdAt: now.toISOString()
      })

      expect(user.createdAt).toBeInstanceOf(Date)
      expect(user.createdAt.getTime()).toBe(now.getTime())
    })

    it('should default type to IndividualUser', () => {
      const user = new AdminUser({
        id: '123',
        username: 'testuser'
      })

      expect(user.type).toBe('IndividualUser')
    })
  })

  describe('getDisplayName', () => {
    it('should return username if available', () => {
      const user = new AdminUser({
        id: '123',
        username: 'testuser',
        email: 'test@example.com'
      })

      expect(user.getDisplayName()).toBe('testuser')
    })

    it('should return email if username not available', () => {
      const user = new AdminUser({
        id: '123',
        username: null,
        email: 'test@example.com'
      })

      expect(user.getDisplayName()).toBe('test@example.com')
    })
  })

  describe('getDisplayNameWithOrg', () => {
    it('should return name with organization if available', () => {
      const user = new AdminUser({
        id: '123',
        username: 'testuser',
        email: 'test@example.com',
        organizationName: 'Test Org'
      })

      expect(user.getDisplayNameWithOrg()).toBe('testuser (Test Org)')
    })

    it('should return just name if no organization', () => {
      const user = new AdminUser({
        id: '123',
        username: 'testuser',
        email: 'test@example.com'
      })

      expect(user.getDisplayNameWithOrg()).toBe('testuser')
    })
  })

  describe('hasOrganization', () => {
    it('should return true if organizationUserId is set', () => {
      const user = new AdminUser({
        id: '123',
        username: 'testuser',
        organizationUserId: 'org-456'
      })

      expect(user.hasOrganization()).toBe(true)
    })

    it('should return false if organizationUserId is not set', () => {
      const user = new AdminUser({
        id: '123',
        username: 'testuser'
      })

      expect(user.hasOrganization()).toBe(false)
    })
  })

  describe('fromApiResponse', () => {
    it('should create AdminUser from API response with _id', () => {
      const apiData = {
        _id: '123',
        username: 'testuser',
        email: 'test@example.com',
        organizationUser: 'org-456',
        organizationName: 'Test Org',
        createdAt: '2024-01-01T00:00:00.000Z',
        __t: 'IndividualUser'
      }

      const user = AdminUser.fromApiResponse(apiData)

      expect(user.id).toBe('123')
      expect(user.username).toBe('testuser')
      expect(user.email).toBe('test@example.com')
      expect(user.organizationUserId).toBe('org-456')
      expect(user.organizationName).toBe('Test Org')
      expect(user.type).toBe('IndividualUser')
    })

    it('should create AdminUser from API response with id', () => {
      const apiData = {
        id: '123',
        username: 'testuser',
        email: 'test@example.com'
      }

      const user = AdminUser.fromApiResponse(apiData)

      expect(user.id).toBe('123')
    })
  })

  describe('toObject', () => {
    it('should convert AdminUser to plain object', () => {
      const user = new AdminUser({
        id: '123',
        username: 'testuser',
        email: 'test@example.com',
        organizationUserId: 'org-456',
        organizationName: 'Test Org',
        createdAt: '2024-01-01T00:00:00.000Z'
      })

      const obj = user.toObject()

      expect(obj).toEqual({
        id: '123',
        username: 'testuser',
        email: 'test@example.com',
        organizationUserId: 'org-456',
        organizationName: 'Test Org',
        createdAt: expect.any(Date),
        type: 'IndividualUser'
      })
    })
  })
})
