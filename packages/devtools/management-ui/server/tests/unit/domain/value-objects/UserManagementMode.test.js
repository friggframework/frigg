/**
 * Unit tests for UserManagementMode Value Object
 * Domain Layer - Represents the active user management configuration from the Frigg app
 *
 * TDD: Write tests first, then implement the value object
 */

import { describe, it, expect } from 'vitest'
import { UserManagementMode } from '../../../../src/domain/value-objects/UserManagementMode.js'

describe('UserManagementMode Value Object', () => {
  describe('static MODES', () => {
    it('should define all three authentication modes', () => {
      expect(UserManagementMode.MODES).toBeDefined()
      expect(UserManagementMode.MODES.FRIGG_TOKEN).toBe('friggToken')
      expect(UserManagementMode.MODES.SHARED_SECRET).toBe('sharedSecret')
      expect(UserManagementMode.MODES.ADOPTER_JWT).toBe('adopterJwt')
    })
  })

  describe('fromAppDefinition', () => {
    it('should create mode from app definition with friggToken enabled', () => {
      const appDefinition = {
        user: {
          authModes: {
            friggToken: { enabled: true },
            sharedSecret: { enabled: false },
            adopterJwt: { enabled: false }
          },
          usePassword: true,
          primary: 'individual',
          individualUserRequired: true,
          organizationUserRequired: false
        }
      }

      const mode = UserManagementMode.fromAppDefinition(appDefinition)

      expect(mode.isFriggTokenEnabled()).toBe(true)
      expect(mode.isSharedSecretEnabled()).toBe(false)
      expect(mode.isAdopterJwtEnabled()).toBe(false)
      expect(mode.isPasswordRequired()).toBe(true)
    })

    it('should create mode from app definition with sharedSecret enabled', () => {
      const appDefinition = {
        user: {
          authModes: {
            friggToken: { enabled: false },
            sharedSecret: { enabled: true },
            adopterJwt: { enabled: false }
          },
          usePassword: false,
          primary: 'organization',
          individualUserRequired: false,
          organizationUserRequired: true
        }
      }

      const mode = UserManagementMode.fromAppDefinition(appDefinition)

      expect(mode.isFriggTokenEnabled()).toBe(false)
      expect(mode.isSharedSecretEnabled()).toBe(true)
      expect(mode.isAdopterJwtEnabled()).toBe(false)
      expect(mode.isPasswordRequired()).toBe(false)
    })

    it('should create mode from app definition with all modes enabled', () => {
      const appDefinition = {
        user: {
          authModes: {
            friggToken: { enabled: true },
            sharedSecret: { enabled: true },
            adopterJwt: { enabled: true }
          },
          usePassword: true,
          primary: 'individual',
          individualUserRequired: true,
          organizationUserRequired: true
        }
      }

      const mode = UserManagementMode.fromAppDefinition(appDefinition)

      expect(mode.isFriggTokenEnabled()).toBe(true)
      expect(mode.isSharedSecretEnabled()).toBe(true)
      expect(mode.isAdopterJwtEnabled()).toBe(true)
    })

    it('should default to friggToken when no authModes specified', () => {
      const appDefinition = {
        user: {}
      }

      const mode = UserManagementMode.fromAppDefinition(appDefinition)

      expect(mode.isFriggTokenEnabled()).toBe(true)
      expect(mode.isSharedSecretEnabled()).toBe(false)
      expect(mode.isAdopterJwtEnabled()).toBe(false)
    })

    it('should handle missing user config by using defaults', () => {
      const appDefinition = {}

      const mode = UserManagementMode.fromAppDefinition(appDefinition)

      expect(mode.isFriggTokenEnabled()).toBe(true)
      expect(mode.isPasswordRequired()).toBe(false)
      expect(mode.getPrimaryUserType()).toBe('individual')
    })

    it('should handle null/undefined input by using defaults', () => {
      const modeFromNull = UserManagementMode.fromAppDefinition(null)
      const modeFromUndefined = UserManagementMode.fromAppDefinition(undefined)

      expect(modeFromNull.isFriggTokenEnabled()).toBe(true)
      expect(modeFromUndefined.isFriggTokenEnabled()).toBe(true)
    })
  })

  describe('constructor', () => {
    it('should create instance with all config options', () => {
      const mode = new UserManagementMode({
        enabledModes: ['friggToken', 'sharedSecret'],
        primaryUserType: 'organization',
        individualRequired: true,
        organizationRequired: true,
        usePassword: true
      })

      expect(mode.isFriggTokenEnabled()).toBe(true)
      expect(mode.isSharedSecretEnabled()).toBe(true)
      expect(mode.isAdopterJwtEnabled()).toBe(false)
      expect(mode.getPrimaryUserType()).toBe('organization')
      expect(mode.isIndividualRequired()).toBe(true)
      expect(mode.isOrganizationRequired()).toBe(true)
      expect(mode.isPasswordRequired()).toBe(true)
    })

    it('should be immutable after creation', () => {
      const mode = new UserManagementMode({
        enabledModes: ['friggToken'],
        primaryUserType: 'individual',
        individualRequired: true,
        organizationRequired: false,
        usePassword: true
      })

      expect(Object.isFrozen(mode)).toBe(true)
    })
  })

  describe('validation', () => {
    it('should identify primary user type correctly', () => {
      const individualMode = new UserManagementMode({
        enabledModes: ['friggToken'],
        primaryUserType: 'individual',
        individualRequired: true,
        organizationRequired: false,
        usePassword: true
      })

      const orgMode = new UserManagementMode({
        enabledModes: ['sharedSecret'],
        primaryUserType: 'organization',
        individualRequired: false,
        organizationRequired: true,
        usePassword: false
      })

      expect(individualMode.getPrimaryUserType()).toBe('individual')
      expect(orgMode.getPrimaryUserType()).toBe('organization')
    })

    it('should report password requirement based on usePassword', () => {
      const withPassword = new UserManagementMode({
        enabledModes: ['friggToken'],
        primaryUserType: 'individual',
        individualRequired: true,
        organizationRequired: false,
        usePassword: true
      })

      const withoutPassword = new UserManagementMode({
        enabledModes: ['sharedSecret'],
        primaryUserType: 'individual',
        individualRequired: true,
        organizationRequired: false,
        usePassword: false
      })

      expect(withPassword.isPasswordRequired()).toBe(true)
      expect(withoutPassword.isPasswordRequired()).toBe(false)
    })
  })

  describe('getEnabledModes', () => {
    it('should return array of enabled mode names', () => {
      const mode = new UserManagementMode({
        enabledModes: ['friggToken', 'sharedSecret'],
        primaryUserType: 'individual',
        individualRequired: true,
        organizationRequired: false,
        usePassword: true
      })

      const enabledModes = mode.getEnabledModes()

      expect(enabledModes).toContain('friggToken')
      expect(enabledModes).toContain('sharedSecret')
      expect(enabledModes).not.toContain('adopterJwt')
    })

    it('should return empty array when no modes enabled', () => {
      const mode = new UserManagementMode({
        enabledModes: [],
        primaryUserType: 'individual',
        individualRequired: true,
        organizationRequired: false,
        usePassword: false
      })

      expect(mode.getEnabledModes()).toEqual([])
    })
  })

  describe('getPrimaryMode', () => {
    it('should return the first enabled mode as primary', () => {
      const mode = new UserManagementMode({
        enabledModes: ['sharedSecret', 'friggToken'],
        primaryUserType: 'individual',
        individualRequired: true,
        organizationRequired: false,
        usePassword: false
      })

      expect(mode.getPrimaryMode()).toBe('sharedSecret')
    })

    it('should return null when no modes enabled', () => {
      const mode = new UserManagementMode({
        enabledModes: [],
        primaryUserType: 'individual',
        individualRequired: true,
        organizationRequired: false,
        usePassword: false
      })

      expect(mode.getPrimaryMode()).toBeNull()
    })
  })

  describe('toJSON', () => {
    it('should serialize to JSON correctly', () => {
      const mode = new UserManagementMode({
        enabledModes: ['friggToken', 'sharedSecret'],
        primaryUserType: 'organization',
        individualRequired: true,
        organizationRequired: true,
        usePassword: true
      })

      const json = mode.toJSON()

      expect(json).toEqual({
        enabledModes: ['friggToken', 'sharedSecret'],
        primaryUserType: 'organization',
        individualRequired: true,
        organizationRequired: true,
        usePassword: true,
        friggTokenEnabled: true,
        sharedSecretEnabled: true,
        adopterJwtEnabled: false
      })
    })
  })

  describe('equals', () => {
    it('should return true for identical modes', () => {
      const mode1 = new UserManagementMode({
        enabledModes: ['friggToken'],
        primaryUserType: 'individual',
        individualRequired: true,
        organizationRequired: false,
        usePassword: true
      })

      const mode2 = new UserManagementMode({
        enabledModes: ['friggToken'],
        primaryUserType: 'individual',
        individualRequired: true,
        organizationRequired: false,
        usePassword: true
      })

      expect(mode1.equals(mode2)).toBe(true)
    })

    it('should return false for different modes', () => {
      const mode1 = new UserManagementMode({
        enabledModes: ['friggToken'],
        primaryUserType: 'individual',
        individualRequired: true,
        organizationRequired: false,
        usePassword: true
      })

      const mode2 = new UserManagementMode({
        enabledModes: ['sharedSecret'],
        primaryUserType: 'organization',
        individualRequired: false,
        organizationRequired: true,
        usePassword: false
      })

      expect(mode1.equals(mode2)).toBe(false)
    })

    it('should return false when comparing with non-UserManagementMode', () => {
      const mode = new UserManagementMode({
        enabledModes: ['friggToken'],
        primaryUserType: 'individual',
        individualRequired: true,
        organizationRequired: false,
        usePassword: true
      })

      expect(mode.equals(null)).toBe(false)
      expect(mode.equals(undefined)).toBe(false)
      expect(mode.equals({})).toBe(false)
      expect(mode.equals('friggToken')).toBe(false)
    })
  })
})
