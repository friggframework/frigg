import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AutoConnectUseCase } from '../../../../../src/application/use-cases/frigg-app/AutoConnectUseCase.js'

describe('AutoConnectUseCase', () => {
  let mockConnectUseCase
  let mockEnvFileReader
  let mockEnvironment
  let useCase

  beforeEach(() => {
    mockConnectUseCase = {
      execute: vi.fn()
    }

    mockEnvFileReader = {
      readAdminApiKey: vi.fn()
    }

    mockEnvironment = {}

    useCase = new AutoConnectUseCase({
      connectToFriggAppUseCase: mockConnectUseCase,
      envFileReader: mockEnvFileReader,
      environment: mockEnvironment
    })
  })

  describe('execute', () => {
    describe('URL validation', () => {
      it('should reject non-localhost URLs', async () => {
        const result = await useCase.execute({
          friggAppUrl: 'http://example.com:3000',
          repositoryPath: '/some/path'
        })

        expect(result.success).toBe(false)
        expect(result.error).toBe('Auto-connect only allowed for localhost')
        expect(mockConnectUseCase.execute).not.toHaveBeenCalled()
      })

      it('should reject invalid URL format', async () => {
        const result = await useCase.execute({
          friggAppUrl: 'not-a-url',
          repositoryPath: '/some/path'
        })

        expect(result.success).toBe(false)
        expect(result.error).toBe('Invalid URL format')
      })

      it('should reject missing URL', async () => {
        const result = await useCase.execute({
          friggAppUrl: null,
          repositoryPath: '/some/path'
        })

        expect(result.success).toBe(false)
        expect(result.error).toBe('URL is required')
      })

      it('should accept localhost URL', async () => {
        mockEnvFileReader.readAdminApiKey.mockResolvedValue('test-key')
        mockConnectUseCase.execute.mockResolvedValue({ success: true })

        await useCase.execute({
          friggAppUrl: 'http://localhost:3000',
          repositoryPath: '/some/path'
        })

        expect(mockConnectUseCase.execute).toHaveBeenCalled()
      })

      it('should accept 127.0.0.1 URL', async () => {
        mockEnvFileReader.readAdminApiKey.mockResolvedValue('test-key')
        mockConnectUseCase.execute.mockResolvedValue({ success: true })

        await useCase.execute({
          friggAppUrl: 'http://127.0.0.1:3000',
          repositoryPath: '/some/path'
        })

        expect(mockConnectUseCase.execute).toHaveBeenCalled()
      })
    })

    describe('API key resolution', () => {
      it('should read API key from repository .env first', async () => {
        mockEnvFileReader.readAdminApiKey.mockResolvedValue('repo-key')
        mockConnectUseCase.execute.mockResolvedValue({ success: true })

        const result = await useCase.execute({
          friggAppUrl: 'http://localhost:3000',
          repositoryPath: '/my/repo'
        })

        expect(mockEnvFileReader.readAdminApiKey).toHaveBeenCalledWith('/my/repo')
        expect(mockConnectUseCase.execute).toHaveBeenCalledWith({
          friggAppUrl: 'http://localhost:3000',
          adminApiKey: 'repo-key'
        })
        expect(result.keySource).toBe('repository')
      })

      it('should fall back to environment variable when .env not found', async () => {
        mockEnvFileReader.readAdminApiKey.mockResolvedValue(null)
        mockEnvironment.FRIGG_ADMIN_API_KEY = 'env-key'
        mockConnectUseCase.execute.mockResolvedValue({ success: true })

        const result = await useCase.execute({
          friggAppUrl: 'http://localhost:3000',
          repositoryPath: '/my/repo'
        })

        expect(mockConnectUseCase.execute).toHaveBeenCalledWith({
          friggAppUrl: 'http://localhost:3000',
          adminApiKey: 'env-key'
        })
        expect(result.keySource).toBe('environment')
      })

      it('should fall back to environment when no repositoryPath provided', async () => {
        mockEnvironment.FRIGG_ADMIN_API_KEY = 'env-key'
        mockConnectUseCase.execute.mockResolvedValue({ success: true })

        const result = await useCase.execute({
          friggAppUrl: 'http://localhost:3000',
          repositoryPath: null
        })

        expect(mockEnvFileReader.readAdminApiKey).not.toHaveBeenCalled()
        expect(result.keySource).toBe('environment')
      })

      it('should return error when no API key found', async () => {
        mockEnvFileReader.readAdminApiKey.mockResolvedValue(null)
        mockEnvironment.FRIGG_ADMIN_API_KEY = undefined

        const result = await useCase.execute({
          friggAppUrl: 'http://localhost:3000',
          repositoryPath: '/my/repo'
        })

        expect(result.success).toBe(false)
        expect(result.error).toBe('FRIGG_ADMIN_API_KEY not found')
        expect(mockConnectUseCase.execute).not.toHaveBeenCalled()
      })

      it('should handle .env read errors gracefully', async () => {
        mockEnvFileReader.readAdminApiKey.mockRejectedValue(new Error('Permission denied'))
        mockEnvironment.FRIGG_ADMIN_API_KEY = 'env-key'
        mockConnectUseCase.execute.mockResolvedValue({ success: true })

        const result = await useCase.execute({
          friggAppUrl: 'http://localhost:3000',
          repositoryPath: '/my/repo'
        })

        expect(result.success).toBe(true)
        expect(result.keySource).toBe('environment')
      })
    })

    describe('connection result', () => {
      it('should pass through successful connection result', async () => {
        mockEnvFileReader.readAdminApiKey.mockResolvedValue('test-key')
        mockConnectUseCase.execute.mockResolvedValue({
          success: true,
          connection: { baseUrl: 'http://localhost:3000' },
          userManagementMode: { friggTokenEnabled: true },
          appDefinition: { name: 'test-app' }
        })

        const result = await useCase.execute({
          friggAppUrl: 'http://localhost:3000',
          repositoryPath: '/my/repo'
        })

        expect(result.success).toBe(true)
        expect(result.connection).toEqual({ baseUrl: 'http://localhost:3000' })
        expect(result.keySource).toBe('repository')
      })

      it('should pass through connection failure', async () => {
        mockEnvFileReader.readAdminApiKey.mockResolvedValue('test-key')
        mockConnectUseCase.execute.mockResolvedValue({
          success: false,
          error: 'Connection refused'
        })

        const result = await useCase.execute({
          friggAppUrl: 'http://localhost:3000',
          repositoryPath: '/my/repo'
        })

        expect(result.success).toBe(false)
        expect(result.error).toBe('Connection refused')
      })
    })
  })
})
