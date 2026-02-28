import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SharedSecretProxyUseCase } from '../../../../../src/application/use-cases/frigg-app/SharedSecretProxyUseCase.js'

describe('SharedSecretProxyUseCase', () => {
  let mockConnectionStateService
  let mockEnvFileReader
  let mockHttpClient
  let mockEnvironment
  let useCase

  beforeEach(() => {
    mockConnectionStateService = {
      getConnection: vi.fn()
    }

    mockEnvFileReader = {
      readSharedSecret: vi.fn()
    }

    mockHttpClient = {
      request: vi.fn()
    }

    mockEnvironment = {}

    useCase = new SharedSecretProxyUseCase({
      connectionStateService: mockConnectionStateService,
      envFileReader: mockEnvFileReader,
      httpClient: mockHttpClient,
      environment: mockEnvironment
    })
  })

  describe('execute', () => {
    describe('parameter validation', () => {
      it('should reject missing appUserId', async () => {
        const result = await useCase.execute({
          method: 'GET',
          path: '/api/integrations',
          appUserId: null,
          appOrgId: 'org-123'
        })

        expect(result.success).toBe(false)
        expect(result.error).toBe('appUserId is required')
      })

      it('should reject missing appOrgId', async () => {
        const result = await useCase.execute({
          method: 'GET',
          path: '/api/integrations',
          appUserId: 'user-123',
          appOrgId: null
        })

        expect(result.success).toBe(false)
        expect(result.error).toBe('appOrgId is required')
      })

      it('should reject IDs over 100 characters', async () => {
        const result = await useCase.execute({
          method: 'GET',
          path: '/api/integrations',
          appUserId: 'a'.repeat(101),
          appOrgId: 'org-123'
        })

        expect(result.success).toBe(false)
        expect(result.error).toBe('User/Org ID too long (max 100 characters)')
      })

      it('should reject invalid characters in IDs', async () => {
        const result = await useCase.execute({
          method: 'GET',
          path: '/api/integrations',
          appUserId: 'user<script>',
          appOrgId: 'org-123'
        })

        expect(result.success).toBe(false)
        expect(result.error).toBe('Invalid characters in user/org ID')
      })

      it('should accept valid IDs with allowed characters', async () => {
        mockConnectionStateService.getConnection.mockReturnValue({
          isConnected: () => true,
          getBaseUrl: () => 'http://localhost:3000'
        })
        mockEnvFileReader.readSharedSecret.mockResolvedValue('test-secret')
        mockHttpClient.request.mockResolvedValue({ status: 200, data: [] })

        const result = await useCase.execute({
          method: 'GET',
          path: '/api/integrations',
          appUserId: 'user_123@test.com',
          appOrgId: 'org-456.test',
          repositoryPath: '/some/path'
        })

        expect(result.success).toBe(true)
      })
    })

    describe('connection validation', () => {
      it('should reject when not connected', async () => {
        mockConnectionStateService.getConnection.mockReturnValue({
          isConnected: () => false
        })

        const result = await useCase.execute({
          method: 'GET',
          path: '/api/integrations',
          appUserId: 'user-123',
          appOrgId: 'org-123'
        })

        expect(result.success).toBe(false)
        expect(result.error).toBe('Frigg app URL not available. Provide friggAppUrl or connect first.')
      })

      it('should reject when connection is null', async () => {
        mockConnectionStateService.getConnection.mockReturnValue(null)

        const result = await useCase.execute({
          method: 'GET',
          path: '/api/integrations',
          appUserId: 'user-123',
          appOrgId: 'org-123'
        })

        expect(result.success).toBe(false)
        expect(result.error).toBe('Frigg app URL not available. Provide friggAppUrl or connect first.')
      })
    })

    describe('shared secret resolution', () => {
      beforeEach(() => {
        mockConnectionStateService.getConnection.mockReturnValue({
          isConnected: () => true,
          getBaseUrl: () => 'http://localhost:3000'
        })
      })

      it('should read secret from repository .env first', async () => {
        mockEnvFileReader.readSharedSecret.mockResolvedValue('repo-secret')
        mockHttpClient.request.mockResolvedValue({ status: 200, data: [] })

        await useCase.execute({
          method: 'GET',
          path: '/api/integrations',
          appUserId: 'user-123',
          appOrgId: 'org-123',
          repositoryPath: '/my/repo'
        })

        expect(mockEnvFileReader.readSharedSecret).toHaveBeenCalledWith('/my/repo')
        expect(mockHttpClient.request).toHaveBeenCalledWith(
          expect.objectContaining({
            headers: expect.objectContaining({
              'x-frigg-api-key': 'repo-secret'
            })
          })
        )
      })

      it('should fall back to environment variable', async () => {
        mockEnvFileReader.readSharedSecret.mockResolvedValue(null)
        mockEnvironment.FRIGG_API_KEY = 'env-secret'
        mockHttpClient.request.mockResolvedValue({ status: 200, data: [] })

        await useCase.execute({
          method: 'GET',
          path: '/api/integrations',
          appUserId: 'user-123',
          appOrgId: 'org-123',
          repositoryPath: '/my/repo'
        })

        expect(mockHttpClient.request).toHaveBeenCalledWith(
          expect.objectContaining({
            headers: expect.objectContaining({
              'x-frigg-api-key': 'env-secret'
            })
          })
        )
      })

      it('should return error when no secret found', async () => {
        mockEnvFileReader.readSharedSecret.mockResolvedValue(null)
        mockEnvironment.FRIGG_API_KEY = undefined

        const result = await useCase.execute({
          method: 'GET',
          path: '/api/integrations',
          appUserId: 'user-123',
          appOrgId: 'org-123',
          repositoryPath: '/my/repo'
        })

        expect(result.success).toBe(false)
        expect(result.error).toBe('FRIGG_API_KEY not found')
        expect(mockHttpClient.request).not.toHaveBeenCalled()
      })
    })

    describe('request forwarding', () => {
      beforeEach(() => {
        mockConnectionStateService.getConnection.mockReturnValue({
          isConnected: () => true,
          getBaseUrl: () => 'http://localhost:3000'
        })
        mockEnvFileReader.readSharedSecret.mockResolvedValue('test-secret')
      })

      it('should forward GET request with correct headers', async () => {
        mockHttpClient.request.mockResolvedValue({
          status: 200,
          data: [{ id: 'int-1' }],
          headers: {}
        })

        const result = await useCase.execute({
          method: 'GET',
          path: '/api/integrations',
          appUserId: 'user-123',
          appOrgId: 'org-456',
          repositoryPath: '/my/repo'
        })

        expect(mockHttpClient.request).toHaveBeenCalledWith({
          method: 'GET',
          url: 'http://localhost:3000/api/integrations',
          headers: {
            'Content-Type': 'application/json',
            'x-frigg-api-key': 'test-secret',
            'x-frigg-appuserid': 'user-123',
            'x-frigg-apporgid': 'org-456'
          },
          data: undefined,
          validateStatus: expect.any(Function)
        })

        expect(result.success).toBe(true)
        expect(result.status).toBe(200)
        expect(result.data).toEqual([{ id: 'int-1' }])
      })

      it('should forward POST request with body', async () => {
        mockHttpClient.request.mockResolvedValue({
          status: 201,
          data: { id: 'new-entity' },
          headers: {}
        })

        const result = await useCase.execute({
          method: 'POST',
          path: '/api/entities',
          appUserId: 'user-123',
          appOrgId: 'org-456',
          body: { name: 'My Entity' },
          repositoryPath: '/my/repo'
        })

        expect(mockHttpClient.request).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'POST',
            data: { name: 'My Entity' }
          })
        )

        expect(result.success).toBe(true)
        expect(result.status).toBe(201)
      })

      it('should handle HTTP error responses', async () => {
        mockHttpClient.request.mockResolvedValue({
          status: 401,
          data: { error: 'Unauthorized' },
          headers: {}
        })

        const result = await useCase.execute({
          method: 'GET',
          path: '/api/integrations',
          appUserId: 'user-123',
          appOrgId: 'org-456',
          repositoryPath: '/my/repo'
        })

        expect(result.success).toBe(true)
        expect(result.status).toBe(401)
        expect(result.data).toEqual({ error: 'Unauthorized' })
      })

      it('should handle network errors', async () => {
        mockHttpClient.request.mockRejectedValue(new Error('ECONNREFUSED'))

        const result = await useCase.execute({
          method: 'GET',
          path: '/api/integrations',
          appUserId: 'user-123',
          appOrgId: 'org-456',
          repositoryPath: '/my/repo'
        })

        expect(result.success).toBe(false)
        expect(result.error).toBe('ECONNREFUSED')
      })
    })
  })
})
