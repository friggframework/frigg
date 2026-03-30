import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EnvFileAdapter } from '../../../../src/infrastructure/adapters/EnvFileAdapter.js'
import fs from 'fs/promises'
import path from 'path'

// Mock fs/promises
vi.mock('fs/promises')

describe('EnvFileAdapter', () => {
  let adapter

  beforeEach(() => {
    adapter = new EnvFileAdapter()
    vi.clearAllMocks()
  })

  describe('validatePath', () => {
    it('should reject null path', () => {
      expect(() => adapter.validatePath(null)).toThrow('Invalid repository path')
    })

    it('should reject empty string', () => {
      expect(() => adapter.validatePath('')).toThrow('Invalid repository path')
    })

    it('should reject non-string path', () => {
      expect(() => adapter.validatePath(123)).toThrow('Invalid repository path')
    })

    it('should reject path traversal attempts', () => {
      expect(() => adapter.validatePath('/some/path/../secret')).toThrow('Path traversal not allowed')
    })

    it('should allow valid paths', () => {
      const result = adapter.validatePath('/valid/repo/path')
      expect(result).toBe(path.resolve('/valid/repo/path'))
    })

    it('should enforce allowed base paths when configured', () => {
      const restrictedAdapter = new EnvFileAdapter({
        allowedBasePaths: ['/allowed/base']
      })

      expect(() => restrictedAdapter.validatePath('/not/allowed/path'))
        .toThrow('Repository path outside allowed directories')
    })

    it('should allow paths within allowed base paths', () => {
      const restrictedAdapter = new EnvFileAdapter({
        allowedBasePaths: ['/allowed/base']
      })

      const result = restrictedAdapter.validatePath('/allowed/base/project')
      expect(result).toBe(path.resolve('/allowed/base/project'))
    })
  })

  describe('getOAuthEnvVarNames', () => {
    it('should generate correct var names for simple module', () => {
      const names = adapter.getOAuthEnvVarNames('hubspot')
      expect(names).toEqual({
        clientId: 'HUBSPOT_CLIENT_ID',
        clientSecret: 'HUBSPOT_CLIENT_SECRET',
        scope: 'HUBSPOT_SCOPE'
      })
    })

    it('should handle hyphenated module names', () => {
      const names = adapter.getOAuthEnvVarNames('my-custom-module')
      expect(names).toEqual({
        clientId: 'MY_CUSTOM_MODULE_CLIENT_ID',
        clientSecret: 'MY_CUSTOM_MODULE_CLIENT_SECRET',
        scope: 'MY_CUSTOM_MODULE_SCOPE'
      })
    })

    it('should convert to uppercase', () => {
      const names = adapter.getOAuthEnvVarNames('Salesforce')
      expect(names).toEqual({
        clientId: 'SALESFORCE_CLIENT_ID',
        clientSecret: 'SALESFORCE_CLIENT_SECRET',
        scope: 'SALESFORCE_SCOPE'
      })
    })
  })

  describe('parseEnvContent', () => {
    it('should parse simple key-value pairs', () => {
      const content = 'KEY1=value1\nKEY2=value2'
      const result = adapter.parseEnvContent(content)
      expect(result).toEqual({
        KEY1: 'value1',
        KEY2: 'value2'
      })
    })

    it('should ignore comments', () => {
      const content = '# This is a comment\nKEY=value'
      const result = adapter.parseEnvContent(content)
      expect(result).toEqual({ KEY: 'value' })
    })

    it('should ignore empty lines', () => {
      const content = 'KEY1=value1\n\nKEY2=value2'
      const result = adapter.parseEnvContent(content)
      expect(result).toEqual({
        KEY1: 'value1',
        KEY2: 'value2'
      })
    })

    it('should handle quoted values (double quotes)', () => {
      const content = 'KEY="quoted value"'
      const result = adapter.parseEnvContent(content)
      expect(result).toEqual({ KEY: 'quoted value' })
    })

    it('should handle quoted values (single quotes)', () => {
      const content = "KEY='single quoted'"
      const result = adapter.parseEnvContent(content)
      expect(result).toEqual({ KEY: 'single quoted' })
    })

    it('should handle values with equals signs', () => {
      const content = 'KEY=value=with=equals'
      const result = adapter.parseEnvContent(content)
      expect(result).toEqual({ KEY: 'value=with=equals' })
    })

    it('should skip malformed lines', () => {
      const content = 'VALID=value\nNOEQUALS\n=nokey'
      const result = adapter.parseEnvContent(content)
      expect(result).toEqual({ VALID: 'value' })
    })
  })

  describe('readEnvFile', () => {
    it('should read and parse existing file', async () => {
      fs.readFile.mockResolvedValue('KEY=value')

      const result = await adapter.readEnvFile('/some/path/.env')

      expect(result).toEqual({ KEY: 'value' })
      expect(fs.readFile).toHaveBeenCalledWith('/some/path/.env', 'utf-8')
    })

    it('should return null for non-existent file', async () => {
      const error = new Error('File not found')
      error.code = 'ENOENT'
      fs.readFile.mockRejectedValue(error)

      const result = await adapter.readEnvFile('/some/path/.env')

      expect(result).toBeNull()
    })

    it('should return null for permission denied', async () => {
      const error = new Error('Permission denied')
      error.code = 'EACCES'
      fs.readFile.mockRejectedValue(error)

      const result = await adapter.readEnvFile('/some/path/.env')

      expect(result).toBeNull()
    })

    it('should throw for other errors', async () => {
      const error = new Error('Unknown error')
      error.code = 'UNKNOWN'
      fs.readFile.mockRejectedValue(error)

      await expect(adapter.readEnvFile('/some/path/.env')).rejects.toThrow('Unknown error')
    })
  })

  describe('checkOAuthCredentials', () => {
    beforeEach(() => {
      fs.readFile.mockImplementation(async (filePath) => {
        const error = new Error('Not found')
        error.code = 'ENOENT'
        throw error
      })
    })

    it('should return complete when all required credentials exist', async () => {
      fs.readFile.mockResolvedValue(
        'HUBSPOT_CLIENT_ID=my-client-id\nHUBSPOT_CLIENT_SECRET=my-secret'
      )

      const result = await adapter.checkOAuthCredentials('/repo', 'hubspot')

      expect(result.complete).toBe(true)
      expect(result.missing).toEqual([])
      expect(result.values.clientId).toBe('my-client-id')
      expect(result.values.clientSecret).toBe('my-secret')
    })

    it('should return incomplete when client ID is missing', async () => {
      fs.readFile.mockResolvedValue('HUBSPOT_CLIENT_SECRET=my-secret')

      const result = await adapter.checkOAuthCredentials('/repo', 'hubspot')

      expect(result.complete).toBe(false)
      expect(result.missing).toContain('clientId')
    })

    it('should return incomplete when client secret is missing', async () => {
      fs.readFile.mockResolvedValue('HUBSPOT_CLIENT_ID=my-id')

      const result = await adapter.checkOAuthCredentials('/repo', 'hubspot')

      expect(result.complete).toBe(false)
      expect(result.missing).toContain('clientSecret')
    })

    it('should not require scope for completion', async () => {
      fs.readFile.mockResolvedValue(
        'HUBSPOT_CLIENT_ID=id\nHUBSPOT_CLIENT_SECRET=secret'
      )

      const result = await adapter.checkOAuthCredentials('/repo', 'hubspot')

      expect(result.complete).toBe(true)
      expect(result.values.scope).toBeNull()
    })

    it('should include scope when present', async () => {
      fs.readFile.mockResolvedValue(
        'HUBSPOT_CLIENT_ID=id\nHUBSPOT_CLIENT_SECRET=secret\nHUBSPOT_SCOPE=read write'
      )

      const result = await adapter.checkOAuthCredentials('/repo', 'hubspot')

      expect(result.values.scope).toBe('read write')
    })
  })

  describe('escapeValue', () => {
    it('should return empty string for null', () => {
      expect(adapter.escapeValue(null)).toBe('')
    })

    it('should return empty string for undefined', () => {
      expect(adapter.escapeValue(undefined)).toBe('')
    })

    it('should not quote simple values', () => {
      expect(adapter.escapeValue('simple')).toBe('simple')
    })

    it('should quote values with spaces', () => {
      expect(adapter.escapeValue('has spaces')).toBe('"has spaces"')
    })

    it('should escape quotes within values', () => {
      expect(adapter.escapeValue('has "quotes"')).toBe('"has \\"quotes\\""')
    })

    it('should quote values with special characters', () => {
      expect(adapter.escapeValue('value#comment')).toBe('"value#comment"')
      expect(adapter.escapeValue('$variable')).toBe('"$variable"')
    })
  })

  describe('findPrimaryEnvFile', () => {
    it('should return first existing file', async () => {
      fs.access.mockImplementation(async (p) => {
        if (p.endsWith('.env')) return // First file exists
        throw new Error('Not found')
      })

      const result = await adapter.findPrimaryEnvFile('/repo')

      expect(result).toBe(path.resolve('/repo/.env'))
    })

    it('should prefer backend/.env when exists', async () => {
      fs.access.mockImplementation(async (p) => {
        if (p.includes('backend/.env')) return // Backend env exists
        throw new Error('Not found')
      })

      const result = await adapter.findPrimaryEnvFile('/repo')

      expect(result).toBe(path.resolve('/repo/backend/.env'))
    })

    it('should return backend/.env as default when backend dir exists', async () => {
      fs.access.mockImplementation(async (p) => {
        // Only backend directory exists, no .env files
        if (p === path.resolve('/repo/backend')) return
        throw new Error('Not found')
      })

      const result = await adapter.findPrimaryEnvFile('/repo')

      expect(result).toBe(path.resolve('/repo/backend/.env'))
    })

    it('should return root .env when no backend dir', async () => {
      fs.access.mockRejectedValue(new Error('Not found'))

      const result = await adapter.findPrimaryEnvFile('/repo')

      expect(result).toBe(path.resolve('/repo/.env'))
    })
  })

  describe('writeOAuthCredentials', () => {
    beforeEach(() => {
      fs.access.mockRejectedValue(new Error('Not found'))
      fs.readFile.mockImplementation(async () => {
        const error = new Error('Not found')
        error.code = 'ENOENT'
        throw error
      })
      fs.writeFile.mockResolvedValue()
      fs.mkdir.mockResolvedValue()
      fs.copyFile.mockResolvedValue()
      fs.readdir.mockResolvedValue([])
    })

    it('should write credentials to new file', async () => {
      const result = await adapter.writeOAuthCredentials('/repo', 'hubspot', {
        clientId: 'my-id',
        clientSecret: 'my-secret'
      })

      expect(result.success).toBe(true)
      expect(fs.writeFile).toHaveBeenCalled()

      const writtenContent = fs.writeFile.mock.calls[0][1]
      expect(writtenContent).toContain('HUBSPOT_CLIENT_ID=my-id')
      expect(writtenContent).toContain('HUBSPOT_CLIENT_SECRET=my-secret')
    })

    it('should include scope when provided', async () => {
      await adapter.writeOAuthCredentials('/repo', 'hubspot', {
        clientId: 'my-id',
        clientSecret: 'my-secret',
        scope: 'read write'
      })

      const writtenContent = fs.writeFile.mock.calls[0][1]
      expect(writtenContent).toContain('HUBSPOT_SCOPE="read write"')
    })

    it('should create backup of existing file', async () => {
      fs.readFile.mockResolvedValue('EXISTING=value')
      fs.readdir.mockResolvedValue([])

      await adapter.writeOAuthCredentials('/repo', 'hubspot', {
        clientId: 'my-id',
        clientSecret: 'my-secret'
      })

      expect(fs.copyFile).toHaveBeenCalled()
    })

    it('should preserve existing content', async () => {
      fs.readFile.mockResolvedValue('# Comment\nEXISTING=value')

      await adapter.writeOAuthCredentials('/repo', 'hubspot', {
        clientId: 'my-id',
        clientSecret: 'my-secret'
      })

      const writtenContent = fs.writeFile.mock.calls[0][1]
      expect(writtenContent).toContain('# Comment')
      expect(writtenContent).toContain('EXISTING=value')
    })

    it('should update existing OAuth credentials', async () => {
      fs.readFile.mockResolvedValue('HUBSPOT_CLIENT_ID=old-id\nHUBSPOT_CLIENT_SECRET=old-secret')

      await adapter.writeOAuthCredentials('/repo', 'hubspot', {
        clientId: 'new-id',
        clientSecret: 'new-secret'
      })

      const writtenContent = fs.writeFile.mock.calls[0][1]
      expect(writtenContent).toContain('HUBSPOT_CLIENT_ID=new-id')
      expect(writtenContent).toContain('HUBSPOT_CLIENT_SECRET=new-secret')
      expect(writtenContent).not.toContain('old-id')
    })

    it('should return written status', async () => {
      const result = await adapter.writeOAuthCredentials('/repo', 'hubspot', {
        clientId: 'my-id',
        clientSecret: 'my-secret'
      })

      expect(result.written).toEqual({
        HUBSPOT_CLIENT_ID: true,
        HUBSPOT_CLIENT_SECRET: true,
        HUBSPOT_SCOPE: false
      })
    })
  })

  describe('rebuildEnvContent', () => {
    it('should add OAuth comment for new credentials', () => {
      const varNames = {
        clientId: 'TEST_CLIENT_ID',
        clientSecret: 'TEST_CLIENT_SECRET',
        scope: 'TEST_SCOPE'
      }

      const result = adapter.rebuildEnvContent('', {
        TEST_CLIENT_ID: 'id',
        TEST_CLIENT_SECRET: 'secret'
      }, varNames)

      expect(result).toContain('# OAuth credentials')
      expect(result).toContain('TEST_CLIENT_ID=id')
    })

    it('should preserve comments and structure', () => {
      const existing = '# Database config\nDB_HOST=localhost\n\n# App config\nAPP_NAME=test'

      const result = adapter.rebuildEnvContent(existing, {
        DB_HOST: 'localhost',
        APP_NAME: 'test',
        NEW_VAR: 'new'
      }, {})

      expect(result).toContain('# Database config')
      expect(result).toContain('# App config')
      expect(result).toContain('NEW_VAR=new')
    })
  })
})
