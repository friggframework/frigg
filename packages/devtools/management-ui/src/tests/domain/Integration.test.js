/**
 * Integration Domain Entity Tests
 * Testing business rules and domain logic
 */

import { describe, it, expect } from 'vitest'
import { Integration } from '../../domain/entities/Integration.js'

describe('Integration Domain Entity', () => {
  describe('constructor', () => {
    it('should create integration with required fields', () => {
      const integration = new Integration({
        name: 'test-integration',
        type: 'api'
      })

      expect(integration.name).toBe('test-integration')
      expect(integration.type).toBe('api')
      expect(integration.status).toBe('inactive')
      expect(integration.displayName).toBe('test-integration')
    })

    it('should create integration with all fields', () => {
      const integrationData = {
        name: 'salesforce',
        displayName: 'Salesforce CRM',
        description: 'Salesforce integration for CRM',
        category: 'CRM',
        type: 'api',
        status: 'active',
        version: '1.0.0',
        modules: ['contacts', 'leads'],
        config: { apiKey: 'test-key' },
        options: { timeout: 5000 },
        metadata: { author: 'team' }
      }

      const integration = new Integration(integrationData)

      expect(integration.name).toBe('salesforce')
      expect(integration.displayName).toBe('Salesforce CRM')
      expect(integration.description).toBe('Salesforce integration for CRM')
      expect(integration.category).toBe('CRM')
      expect(integration.type).toBe('api')
      expect(integration.status).toBe('active')
      expect(integration.version).toBe('1.0.0')
      expect(integration.modules).toEqual(['contacts', 'leads'])
      expect(integration.config).toEqual({ apiKey: 'test-key' })
      expect(integration.options).toEqual({ timeout: 5000 })
      expect(integration.metadata).toEqual({ author: 'team' })
    })
  })

  describe('validation', () => {
    it('should throw error when name is missing', () => {
      expect(() => {
        new Integration({ type: 'api' })
      }).toThrow('Integration name is required and must be a string')
    })

    it('should throw error when name is not string', () => {
      expect(() => {
        new Integration({ name: 123, type: 'api' })
      }).toThrow('Integration name is required and must be a string')
    })

    it('should throw error when type is missing', () => {
      expect(() => {
        new Integration({ name: 'test' })
      }).toThrow('Integration type is required and must be a string')
    })

    it('should throw error when type is not string', () => {
      expect(() => {
        new Integration({ name: 'test', type: 123 })
      }).toThrow('Integration type is required and must be a string')
    })
  })

  describe('business methods', () => {
    let integration

    beforeEach(() => {
      integration = new Integration({
        name: 'test-integration',
        type: 'api',
        status: 'active',
        modules: ['module1', 'module2'],
        config: { key1: 'value1' },
        options: { option1: 'optionValue1' }
      })
    })

    describe('isActive', () => {
      it('should return true when status is active', () => {
        expect(integration.isActive()).toBe(true)
      })

      it('should return false when status is not active', () => {
        integration.status = 'inactive'
        expect(integration.isActive()).toBe(false)
      })
    })

    describe('hasModules', () => {
      it('should return true when modules exist', () => {
        expect(integration.hasModules()).toBe(true)
      })

      it('should return false when no modules', () => {
        integration.modules = []
        expect(integration.hasModules()).toBe(false)
      })

      it('should return false when modules is null', () => {
        integration.modules = null
        expect(integration.hasModules()).toBe(false)
      })
    })

    describe('getConfigValue', () => {
      it('should return config value for existing key', () => {
        expect(integration.getConfigValue('key1')).toBe('value1')
      })

      it('should return undefined for non-existing key', () => {
        expect(integration.getConfigValue('nonExistent')).toBeUndefined()
      })
    })

    describe('getOptionValue', () => {
      it('should return option value for existing key', () => {
        expect(integration.getOptionValue('option1')).toBe('optionValue1')
      })

      it('should return undefined for non-existing key', () => {
        expect(integration.getOptionValue('nonExistent')).toBeUndefined()
      })
    })

    describe('updateStatus', () => {
      it('should update status to valid value', () => {
        integration.updateStatus('pending')
        expect(integration.status).toBe('pending')
      })

      it('should throw error for invalid status', () => {
        expect(() => {
          integration.updateStatus('invalid')
        }).toThrow('Invalid status: invalid. Must be one of: active, inactive, error, pending')
      })

      it('should accept all valid statuses', () => {
        const validStatuses = ['active', 'inactive', 'error', 'pending']

        validStatuses.forEach(status => {
          expect(() => {
            integration.updateStatus(status)
          }).not.toThrow()
          expect(integration.status).toBe(status)
        })
      })
    })

    describe('clone', () => {
      it('should create exact copy of integration', () => {
        const cloned = integration.clone()

        expect(cloned).not.toBe(integration)
        expect(cloned.name).toBe(integration.name)
        expect(cloned.type).toBe(integration.type)
        expect(cloned.status).toBe(integration.status)
        expect(cloned.modules).toEqual(integration.modules)
        expect(cloned.modules).not.toBe(integration.modules)
        expect(cloned.config).toEqual(integration.config)
        expect(cloned.config).not.toBe(integration.config)
      })

      it('should create independent copy', () => {
        const cloned = integration.clone()

        cloned.updateStatus('error')
        cloned.modules.push('newModule')
        cloned.config.newKey = 'newValue'

        expect(integration.status).toBe('active')
        expect(integration.modules).toEqual(['module1', 'module2'])
        expect(integration.config).toEqual({ key1: 'value1' })
      })
    })

    describe('toObject', () => {
      it('should convert to plain object', () => {
        const obj = integration.toObject()

        expect(obj).toEqual({
          name: 'test-integration',
          displayName: 'test-integration',
          description: undefined,
          category: undefined,
          type: 'api',
          status: 'active',
          version: undefined,
          modules: ['module1', 'module2'],
          config: { key1: 'value1' },
          options: { option1: 'optionValue1' },
          metadata: {}
        })
      })
    })

    describe('fromObject', () => {
      it('should create integration from plain object', () => {
        const obj = {
          name: 'github',
          type: 'git',
          status: 'active',
          modules: ['repos']
        }

        const integration = Integration.fromObject(obj)

        expect(integration).toBeInstanceOf(Integration)
        expect(integration.name).toBe('github')
        expect(integration.type).toBe('git')
        expect(integration.status).toBe('active')
        expect(integration.modules).toEqual(['repos'])
      })
    })
  })

  describe('edge cases', () => {
    it('should handle empty arrays', () => {
      const integration = new Integration({
        name: 'test',
        type: 'api',
        modules: []
      })

      expect(integration.hasModules()).toBe(false)
      expect(integration.modules).toEqual([])
    })

    it('should handle empty objects', () => {
      const integration = new Integration({
        name: 'test',
        type: 'api',
        config: {},
        options: {},
        metadata: {}
      })

      expect(integration.config).toEqual({})
      expect(integration.options).toEqual({})
      expect(integration.metadata).toEqual({})
    })

    it('should handle null values gracefully', () => {
      const integration = new Integration({
        name: 'test',
        type: 'api',
        description: null,
        category: null,
        version: null
      })

      expect(integration.description).toBeNull()
      expect(integration.category).toBeNull()
      expect(integration.version).toBeNull()
    })
  })
})