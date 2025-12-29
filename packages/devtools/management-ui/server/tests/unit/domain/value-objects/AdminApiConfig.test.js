/**
 * Unit tests for AdminApiConfig Value Object
 * Domain Layer - Configuration for connecting to the Frigg app's admin API
 *
 * TDD: Write tests first, then implement the value object
 */

import { describe, it, expect } from 'vitest'
import { AdminApiConfig } from '../../../../src/domain/value-objects/AdminApiConfig.js'

describe('AdminApiConfig Value Object', () => {
  describe('constructor', () => {
    it('should create instance with valid config', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-api-key-123',
        timeout: 5000
      })

      expect(config.getBaseUrl()).toBe('http://localhost:3000')
      expect(config.getApiKey()).toBe('test-api-key-123')
      expect(config.getTimeout()).toBe(5000)
    })

    it('should use default timeout when not specified', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-api-key'
      })

      expect(config.getTimeout()).toBe(30000)
    })

    it('should be immutable after creation', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-api-key'
      })

      expect(Object.isFrozen(config)).toBe(true)
    })
  })

  describe('validate', () => {
    it('should pass validation with valid http URL and API key', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'valid-api-key'
      })

      expect(() => config.validate()).not.toThrow()
    })

    it('should pass validation with valid https URL', () => {
      const config = new AdminApiConfig({
        baseUrl: 'https://api.example.com',
        apiKey: 'valid-api-key'
      })

      expect(() => config.validate()).not.toThrow()
    })

    it('should fail validation with invalid URL format', () => {
      const config = new AdminApiConfig({
        baseUrl: 'not-a-valid-url',
        apiKey: 'valid-api-key'
      })

      expect(() => config.validate()).toThrow('Invalid baseUrl format')
    })

    it('should fail validation with empty baseUrl', () => {
      const config = new AdminApiConfig({
        baseUrl: '',
        apiKey: 'valid-api-key'
      })

      expect(() => config.validate()).toThrow('baseUrl is required')
    })

    it('should fail validation with null baseUrl', () => {
      const config = new AdminApiConfig({
        baseUrl: null,
        apiKey: 'valid-api-key'
      })

      expect(() => config.validate()).toThrow('baseUrl is required')
    })

    it('should fail validation with empty API key in production', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: '',
        isProduction: true
      })

      expect(() => config.validate()).toThrow('apiKey is required in production')
    })

    it('should pass validation with empty API key in non-production', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: '',
        isProduction: false
      })

      expect(() => config.validate()).not.toThrow()
    })

    it('should validate URL with trailing slash', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000/',
        apiKey: 'valid-api-key'
      })

      expect(() => config.validate()).not.toThrow()
    })

    it('should validate URL with port', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:8080',
        apiKey: 'valid-api-key'
      })

      expect(() => config.validate()).not.toThrow()
      expect(config.getBaseUrl()).toBe('http://localhost:8080')
    })
  })

  describe('isConfigured', () => {
    it('should return true when baseUrl and apiKey are set', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-api-key'
      })

      expect(config.isConfigured()).toBe(true)
    })

    it('should return false when baseUrl is missing', () => {
      const config = new AdminApiConfig({
        baseUrl: '',
        apiKey: 'test-api-key'
      })

      expect(config.isConfigured()).toBe(false)
    })

    it('should return false when apiKey is missing', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: ''
      })

      expect(config.isConfigured()).toBe(false)
    })

    it('should return false when both are missing', () => {
      const config = new AdminApiConfig({
        baseUrl: null,
        apiKey: null
      })

      expect(config.isConfigured()).toBe(false)
    })
  })

  describe('getAuthHeaders', () => {
    it('should generate correct auth headers with API key', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-api-key-123'
      })

      const headers = config.getAuthHeaders()

      expect(headers).toEqual({
        'X-API-Key': 'test-api-key-123',
        'Content-Type': 'application/json'
      })
    })

    it('should generate headers without API key when not set', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: ''
      })

      const headers = config.getAuthHeaders()

      expect(headers).toEqual({
        'Content-Type': 'application/json'
      })
      expect(headers['X-API-Key']).toBeUndefined()
    })
  })

  describe('getNormalizedBaseUrl', () => {
    it('should remove trailing slash from URL', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000/',
        apiKey: 'test-api-key'
      })

      expect(config.getNormalizedBaseUrl()).toBe('http://localhost:3000')
    })

    it('should keep URL without trailing slash unchanged', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-api-key'
      })

      expect(config.getNormalizedBaseUrl()).toBe('http://localhost:3000')
    })

    it('should remove multiple trailing slashes', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000///',
        apiKey: 'test-api-key'
      })

      expect(config.getNormalizedBaseUrl()).toBe('http://localhost:3000')
    })
  })

  describe('toJSON', () => {
    it('should serialize config correctly', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-api-key',
        timeout: 5000
      })

      const json = config.toJSON()

      expect(json).toEqual({
        baseUrl: 'http://localhost:3000',
        timeout: 5000,
        isConfigured: true
      })
      // API key should NOT be serialized for security
      expect(json.apiKey).toBeUndefined()
    })
  })

  describe('equals', () => {
    it('should return true for identical configs', () => {
      const config1 = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-api-key',
        timeout: 5000
      })

      const config2 = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-api-key',
        timeout: 5000
      })

      expect(config1.equals(config2)).toBe(true)
    })

    it('should return false for different baseUrls', () => {
      const config1 = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-api-key'
      })

      const config2 = new AdminApiConfig({
        baseUrl: 'http://localhost:4000',
        apiKey: 'test-api-key'
      })

      expect(config1.equals(config2)).toBe(false)
    })

    it('should return false for different API keys', () => {
      const config1 = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-api-key-1'
      })

      const config2 = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-api-key-2'
      })

      expect(config1.equals(config2)).toBe(false)
    })

    it('should return false when comparing with non-AdminApiConfig', () => {
      const config = new AdminApiConfig({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-api-key'
      })

      expect(config.equals(null)).toBe(false)
      expect(config.equals(undefined)).toBe(false)
      expect(config.equals({})).toBe(false)
      expect(config.equals('http://localhost:3000')).toBe(false)
    })
  })

  describe('static fromEnv', () => {
    it('should create config from environment-like object', () => {
      const env = {
        FRIGG_APP_URL: 'http://localhost:3000',
        FRIGG_ADMIN_API_KEY: 'env-api-key'
      }

      const config = AdminApiConfig.fromEnv(env)

      expect(config.getBaseUrl()).toBe('http://localhost:3000')
      expect(config.getApiKey()).toBe('env-api-key')
    })

    it('should handle missing environment variables', () => {
      const config = AdminApiConfig.fromEnv({})

      expect(config.getBaseUrl()).toBeNull()
      expect(config.getApiKey()).toBeNull()
      expect(config.isConfigured()).toBe(false)
    })
  })
})
