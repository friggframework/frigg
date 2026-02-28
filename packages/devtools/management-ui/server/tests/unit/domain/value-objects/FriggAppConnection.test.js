/**
 * Unit tests for FriggAppConnection Value Object
 * Domain Layer - Represents the connection state to a running Frigg app
 *
 * TDD: Write tests first, then implement the value object
 */

import { describe, it, expect } from 'vitest'
import { FriggAppConnection } from '../../../../src/domain/value-objects/FriggAppConnection.js'
import { UserManagementMode } from '../../../../src/domain/value-objects/UserManagementMode.js'
import { AdminApiConfig } from '../../../../src/domain/value-objects/AdminApiConfig.js'

describe('FriggAppConnection Value Object', () => {
  describe('static STATES', () => {
    it('should define all connection states', () => {
      expect(FriggAppConnection.STATES).toBeDefined()
      expect(FriggAppConnection.STATES.DISCONNECTED).toBe('disconnected')
      expect(FriggAppConnection.STATES.CONNECTING).toBe('connecting')
      expect(FriggAppConnection.STATES.CONNECTED).toBe('connected')
      expect(FriggAppConnection.STATES.ERROR).toBe('error')
    })
  })

  describe('constructor', () => {
    it('should create instance with all properties', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key'
      })

      const userMode = new UserManagementMode({
        enabledModes: ['friggToken'],
        primaryUserType: 'individual',
        individualRequired: true,
        organizationRequired: false,
        usePassword: true
      })

      const connection = new FriggAppConnection({
        state: FriggAppConnection.STATES.CONNECTED,
        config,
        healthStatus: { status: 'healthy', responseTime: 50 },
        userManagementMode: userMode,
        appDefinition: { name: 'test-app' },
        lastChecked: new Date('2024-01-01T00:00:00Z'),
        errorMessage: null
      })

      expect(connection.getState()).toBe('connected')
      expect(connection.getConfig()).toBe(config)
      expect(connection.getUserManagementMode()).toBe(userMode)
    })

    it('should be immutable after creation', () => {
      const connection = new FriggAppConnection({
        state: FriggAppConnection.STATES.DISCONNECTED,
        config: null,
        healthStatus: null,
        userManagementMode: null,
        appDefinition: null,
        lastChecked: null,
        errorMessage: null
      })

      expect(Object.isFrozen(connection)).toBe(true)
    })
  })

  describe('static disconnected', () => {
    it('should create a disconnected connection state', () => {
      const connection = FriggAppConnection.disconnected()

      expect(connection.getState()).toBe('disconnected')
      expect(connection.isConnected()).toBe(false)
      expect(connection.isHealthy()).toBe(false)
    })
  })

  describe('static connecting', () => {
    it('should create a connecting state with config', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key'
      })

      const connection = FriggAppConnection.connecting(config)

      expect(connection.getState()).toBe('connecting')
      expect(connection.getConfig()).toBe(config)
      expect(connection.isConnected()).toBe(false)
    })
  })

  describe('static connected', () => {
    it('should create a connected state with full context', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key'
      })

      const userMode = new UserManagementMode({
        enabledModes: ['friggToken'],
        primaryUserType: 'individual',
        individualRequired: true,
        organizationRequired: false,
        usePassword: true
      })

      const connection = FriggAppConnection.connected({
        config,
        healthStatus: { status: 'healthy', responseTime: 50 },
        userManagementMode: userMode,
        appDefinition: { name: 'test-app' }
      })

      expect(connection.getState()).toBe('connected')
      expect(connection.isConnected()).toBe(true)
      expect(connection.isHealthy()).toBe(true)
      expect(connection.getHealthStatus()).toEqual({ status: 'healthy', responseTime: 50 })
    })
  })

  describe('static error', () => {
    it('should create an error state with message', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key'
      })

      const connection = FriggAppConnection.error(config, 'Connection refused')

      expect(connection.getState()).toBe('error')
      expect(connection.isConnected()).toBe(false)
      expect(connection.getErrorMessage()).toBe('Connection refused')
    })
  })

  describe('isConnected', () => {
    it('should return true only when state is CONNECTED', () => {
      const connected = new FriggAppConnection({
        state: FriggAppConnection.STATES.CONNECTED,
        config: null,
        healthStatus: { status: 'healthy' },
        userManagementMode: null,
        appDefinition: null,
        lastChecked: null,
        errorMessage: null
      })

      const disconnected = new FriggAppConnection({
        state: FriggAppConnection.STATES.DISCONNECTED,
        config: null,
        healthStatus: null,
        userManagementMode: null,
        appDefinition: null,
        lastChecked: null,
        errorMessage: null
      })

      const connecting = new FriggAppConnection({
        state: FriggAppConnection.STATES.CONNECTING,
        config: null,
        healthStatus: null,
        userManagementMode: null,
        appDefinition: null,
        lastChecked: null,
        errorMessage: null
      })

      const error = new FriggAppConnection({
        state: FriggAppConnection.STATES.ERROR,
        config: null,
        healthStatus: null,
        userManagementMode: null,
        appDefinition: null,
        lastChecked: null,
        errorMessage: 'Some error'
      })

      expect(connected.isConnected()).toBe(true)
      expect(disconnected.isConnected()).toBe(false)
      expect(connecting.isConnected()).toBe(false)
      expect(error.isConnected()).toBe(false)
    })
  })

  describe('isHealthy', () => {
    it('should return true when connected and health status is healthy', () => {
      const connection = new FriggAppConnection({
        state: FriggAppConnection.STATES.CONNECTED,
        config: null,
        healthStatus: { status: 'healthy', responseTime: 50 },
        userManagementMode: null,
        appDefinition: null,
        lastChecked: null,
        errorMessage: null
      })

      expect(connection.isHealthy()).toBe(true)
    })

    it('should return false when health status is unhealthy', () => {
      const connection = new FriggAppConnection({
        state: FriggAppConnection.STATES.CONNECTED,
        config: null,
        healthStatus: { status: 'unhealthy', error: 'Database down' },
        userManagementMode: null,
        appDefinition: null,
        lastChecked: null,
        errorMessage: null
      })

      expect(connection.isHealthy()).toBe(false)
    })

    it('should return false when not connected', () => {
      const connection = new FriggAppConnection({
        state: FriggAppConnection.STATES.DISCONNECTED,
        config: null,
        healthStatus: null,
        userManagementMode: null,
        appDefinition: null,
        lastChecked: null,
        errorMessage: null
      })

      expect(connection.isHealthy()).toBe(false)
    })
  })

  describe('getBaseUrl', () => {
    it('should return base URL from config', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key'
      })

      const connection = new FriggAppConnection({
        state: FriggAppConnection.STATES.CONNECTED,
        config,
        healthStatus: { status: 'healthy' },
        userManagementMode: null,
        appDefinition: null,
        lastChecked: null,
        errorMessage: null
      })

      expect(connection.getBaseUrl()).toBe('http://localhost:3000')
    })

    it('should return null when config is null', () => {
      const connection = FriggAppConnection.disconnected()

      expect(connection.getBaseUrl()).toBeNull()
    })
  })

  describe('toJSON', () => {
    it('should serialize connection state correctly', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key'
      })

      const userMode = new UserManagementMode({
        enabledModes: ['friggToken', 'sharedSecret'],
        primaryUserType: 'individual',
        individualRequired: true,
        organizationRequired: false,
        usePassword: true
      })

      const lastChecked = new Date('2024-01-01T12:00:00Z')

      const connection = new FriggAppConnection({
        state: FriggAppConnection.STATES.CONNECTED,
        config,
        healthStatus: { status: 'healthy', responseTime: 50 },
        userManagementMode: userMode,
        appDefinition: { name: 'test-app' },
        lastChecked,
        errorMessage: null
      })

      const json = connection.toJSON()

      expect(json).toEqual({
        state: 'connected',
        baseUrl: 'http://localhost:3000',
        isConnected: true,
        isHealthy: true,
        healthStatus: { status: 'healthy', responseTime: 50 },
        userManagementMode: userMode.toJSON(),
        appName: 'test-app',
        lastChecked: lastChecked.toISOString(),
        errorMessage: null
      })
    })

    it('should handle null values in serialization', () => {
      const connection = FriggAppConnection.disconnected()
      const json = connection.toJSON()

      expect(json.state).toBe('disconnected')
      expect(json.baseUrl).toBeNull()
      expect(json.userManagementMode).toBeNull()
    })
  })

  describe('withUpdatedHealth', () => {
    it('should create new connection with updated health status', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key'
      })

      const original = FriggAppConnection.connected({
        config,
        healthStatus: { status: 'healthy', responseTime: 50 },
        userManagementMode: null,
        appDefinition: null
      })

      const updated = original.withUpdatedHealth({ status: 'unhealthy', error: 'Timeout' })

      expect(original.getHealthStatus()).toEqual({ status: 'healthy', responseTime: 50 })
      expect(updated.getHealthStatus()).toEqual({ status: 'unhealthy', error: 'Timeout' })
      expect(updated.isHealthy()).toBe(false)
    })

    it('should preserve other properties', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key'
      })

      const userMode = new UserManagementMode({
        enabledModes: ['friggToken'],
        primaryUserType: 'individual',
        individualRequired: true,
        organizationRequired: false,
        usePassword: true
      })

      const original = FriggAppConnection.connected({
        config,
        healthStatus: { status: 'healthy' },
        userManagementMode: userMode,
        appDefinition: { name: 'my-app' }
      })

      const updated = original.withUpdatedHealth({ status: 'healthy', responseTime: 100 })

      expect(updated.getConfig()).toBe(config)
      expect(updated.getUserManagementMode()).toBe(userMode)
      expect(updated.getAppDefinition()).toEqual({ name: 'my-app' })
    })
  })
})
