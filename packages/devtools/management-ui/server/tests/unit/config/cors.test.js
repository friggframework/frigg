/**
 * Unit tests for CORS Configuration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getCorsConfig,
  getExpressCorsConfig,
  getSocketIoCorsConfig,
  isOriginAllowed,
  DEFAULT_ORIGINS,
  DEFAULT_METHODS
} from '../../../src/config/cors.js'

describe('CORS Configuration', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Clear environment variables before each test
    delete process.env.CORS_ORIGINS
    delete process.env.CORS_METHODS
    delete process.env.CORS_CREDENTIALS
  })

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv }
  })

  describe('getCorsConfig', () => {
    it('should return default configuration when no env vars set', () => {
      const config = getCorsConfig()

      expect(config.origin).toEqual(DEFAULT_ORIGINS)
      expect(config.methods).toEqual(DEFAULT_METHODS)
      expect(config.credentials).toBe(true)
    })

    it('should parse CORS_ORIGINS from environment', () => {
      process.env.CORS_ORIGINS = 'https://example.com,https://app.example.com'

      const config = getCorsConfig()

      expect(config.origin).toEqual([
        'https://example.com',
        'https://app.example.com'
      ])
    })

    it('should parse single origin', () => {
      process.env.CORS_ORIGINS = 'https://single.example.com'

      const config = getCorsConfig()

      expect(config.origin).toEqual(['https://single.example.com'])
    })

    it('should handle whitespace in origins', () => {
      process.env.CORS_ORIGINS = '  https://example.com  ,  https://app.example.com  '

      const config = getCorsConfig()

      expect(config.origin).toEqual([
        'https://example.com',
        'https://app.example.com'
      ])
    })

    it('should parse CORS_METHODS from environment', () => {
      process.env.CORS_METHODS = 'GET,POST'

      const config = getCorsConfig()

      expect(config.methods).toEqual(['GET', 'POST'])
    })

    it('should parse CORS_CREDENTIALS as true', () => {
      process.env.CORS_CREDENTIALS = 'true'

      const config = getCorsConfig()

      expect(config.credentials).toBe(true)
    })

    it('should parse CORS_CREDENTIALS as false', () => {
      process.env.CORS_CREDENTIALS = 'false'

      const config = getCorsConfig()

      expect(config.credentials).toBe(false)
    })

    it('should parse CORS_CREDENTIALS as 1 (true)', () => {
      process.env.CORS_CREDENTIALS = '1'

      const config = getCorsConfig()

      expect(config.credentials).toBe(true)
    })

    it('should use default for empty CORS_ORIGINS', () => {
      process.env.CORS_ORIGINS = ''

      const config = getCorsConfig()

      expect(config.origin).toEqual(DEFAULT_ORIGINS)
    })

    it('should filter empty strings from origins', () => {
      process.env.CORS_ORIGINS = 'https://example.com,,https://app.example.com,'

      const config = getCorsConfig()

      expect(config.origin).toEqual([
        'https://example.com',
        'https://app.example.com'
      ])
    })
  })

  describe('getExpressCorsConfig', () => {
    it('should return origin and credentials', () => {
      const config = getExpressCorsConfig()

      expect(config).toHaveProperty('origin')
      expect(config).toHaveProperty('credentials')
      expect(config).not.toHaveProperty('methods')
    })

    it('should use environment origin', () => {
      process.env.CORS_ORIGINS = 'https://custom.example.com'

      const config = getExpressCorsConfig()

      expect(config.origin).toEqual(['https://custom.example.com'])
    })
  })

  describe('getSocketIoCorsConfig', () => {
    it('should return full CORS config', () => {
      const config = getSocketIoCorsConfig()

      expect(config).toHaveProperty('origin')
      expect(config).toHaveProperty('methods')
      expect(config).toHaveProperty('credentials')
    })

    it('should use environment values', () => {
      process.env.CORS_ORIGINS = 'https://socket.example.com'
      process.env.CORS_METHODS = 'GET,POST'

      const config = getSocketIoCorsConfig()

      expect(config.origin).toEqual(['https://socket.example.com'])
      expect(config.methods).toEqual(['GET', 'POST'])
    })
  })

  describe('isOriginAllowed', () => {
    it('should return true for allowed origin', () => {
      const result = isOriginAllowed('http://localhost:5173')

      expect(result).toBe(true)
    })

    it('should return false for disallowed origin', () => {
      const result = isOriginAllowed('https://malicious.com')

      expect(result).toBe(false)
    })

    it('should return true when wildcard is in origins', () => {
      process.env.CORS_ORIGINS = '*'

      const result = isOriginAllowed('https://any-origin.com')

      expect(result).toBe(true)
    })

    it('should check custom origins from environment', () => {
      process.env.CORS_ORIGINS = 'https://allowed.com,https://also-allowed.com'

      expect(isOriginAllowed('https://allowed.com')).toBe(true)
      expect(isOriginAllowed('https://also-allowed.com')).toBe(true)
      expect(isOriginAllowed('https://not-allowed.com')).toBe(false)
    })
  })

  describe('DEFAULT_ORIGINS', () => {
    it('should include common development ports', () => {
      expect(DEFAULT_ORIGINS).toContain('http://localhost:5173')
      expect(DEFAULT_ORIGINS).toContain('http://localhost:3000')
      expect(DEFAULT_ORIGINS).toContain('http://localhost:3001')
    })
  })

  describe('DEFAULT_METHODS', () => {
    it('should include common HTTP methods', () => {
      expect(DEFAULT_METHODS).toContain('GET')
      expect(DEFAULT_METHODS).toContain('POST')
      expect(DEFAULT_METHODS).toContain('PUT')
      expect(DEFAULT_METHODS).toContain('DELETE')
      expect(DEFAULT_METHODS).toContain('PATCH')
    })
  })
})
