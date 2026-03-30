import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WriteOAuthCredentialsUseCase } from '../../../../../src/application/use-cases/frigg-app/WriteOAuthCredentialsUseCase.js'

describe('WriteOAuthCredentialsUseCase', () => {
  let mockEnvFileAdapter
  let useCase

  beforeEach(() => {
    mockEnvFileAdapter = {
      writeOAuthCredentials: vi.fn().mockResolvedValue({
        success: true,
        path: '/repo/backend/.env',
        written: {
          HUBSPOT_CLIENT_ID: true,
          HUBSPOT_CLIENT_SECRET: true,
          HUBSPOT_SCOPE: false
        }
      })
    }

    useCase = new WriteOAuthCredentialsUseCase({
      envFileAdapter: mockEnvFileAdapter
    })
  })

  describe('execute', () => {
    describe('input validation', () => {
      it('should throw error when repositoryPath is missing', async () => {
        await expect(useCase.execute({
          repositoryPath: null,
          moduleName: 'hubspot',
          credentials: { clientId: 'id', clientSecret: 'secret' }
        })).rejects.toThrow('Repository path is required')
      })

      it('should throw error when moduleName is missing', async () => {
        await expect(useCase.execute({
          repositoryPath: '/repo',
          moduleName: null,
          credentials: { clientId: 'id', clientSecret: 'secret' }
        })).rejects.toThrow('Module name is required')
      })

      it('should throw error when credentials object is missing', async () => {
        await expect(useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot',
          credentials: null
        })).rejects.toThrow('Credentials object is required')
      })

      it('should throw error when credentials is not an object', async () => {
        await expect(useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot',
          credentials: 'invalid'
        })).rejects.toThrow('Credentials object is required')
      })

      it('should throw error when clientId is missing', async () => {
        await expect(useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot',
          credentials: { clientSecret: 'secret' }
        })).rejects.toThrow('Client ID is required and must be a string')
      })

      it('should throw error when clientId is not a string', async () => {
        await expect(useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot',
          credentials: { clientId: 123, clientSecret: 'secret' }
        })).rejects.toThrow('Client ID is required and must be a string')
      })

      it('should throw error when clientSecret is missing', async () => {
        await expect(useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot',
          credentials: { clientId: 'id' }
        })).rejects.toThrow('Client Secret is required and must be a string')
      })

      it('should throw error when clientSecret is not a string', async () => {
        await expect(useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot',
          credentials: { clientId: 'id', clientSecret: 456 }
        })).rejects.toThrow('Client Secret is required and must be a string')
      })
    })

    describe('security validation', () => {
      it('should reject clientId with newlines', async () => {
        await expect(useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot',
          credentials: { clientId: 'id\nwith\nnewlines', clientSecret: 'secret' }
        })).rejects.toThrow('Client ID contains invalid characters')
      })

      it('should reject clientId with carriage returns', async () => {
        await expect(useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot',
          credentials: { clientId: 'id\rwith\rreturns', clientSecret: 'secret' }
        })).rejects.toThrow('Client ID contains invalid characters')
      })

      it('should reject clientId with control characters', async () => {
        await expect(useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot',
          credentials: { clientId: 'id\x00with\x1fcontrol', clientSecret: 'secret' }
        })).rejects.toThrow('Client ID contains invalid characters')
      })

      it('should reject clientSecret with newlines', async () => {
        await expect(useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot',
          credentials: { clientId: 'id', clientSecret: 'secret\nwith\nnewlines' }
        })).rejects.toThrow('Client Secret contains invalid characters')
      })

      it('should reject clientSecret with control characters', async () => {
        await expect(useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot',
          credentials: { clientId: 'id', clientSecret: 'secret\x00hidden' }
        })).rejects.toThrow('Client Secret contains invalid characters')
      })
    })

    describe('module name normalization', () => {
      it('should convert module name to lowercase', async () => {
        await useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'HubSpot',
          credentials: { clientId: 'id', clientSecret: 'secret' }
        })

        expect(mockEnvFileAdapter.writeOAuthCredentials).toHaveBeenCalledWith(
          '/repo',
          'hubspot',
          expect.any(Object)
        )
      })

      it('should remove special characters from module name', async () => {
        await useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'my@module!',
          credentials: { clientId: 'id', clientSecret: 'secret' }
        })

        expect(mockEnvFileAdapter.writeOAuthCredentials).toHaveBeenCalledWith(
          '/repo',
          'mymodule',
          expect.any(Object)
        )
      })
    })

    describe('credential sanitization', () => {
      it('should trim whitespace from credentials', async () => {
        await useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot',
          credentials: {
            clientId: '  my-id  ',
            clientSecret: '  my-secret  '
          }
        })

        expect(mockEnvFileAdapter.writeOAuthCredentials).toHaveBeenCalledWith(
          '/repo',
          'hubspot',
          expect.objectContaining({
            clientId: 'my-id',
            clientSecret: 'my-secret'
          })
        )
      })

      it('should sanitize scope if provided', async () => {
        await useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot',
          credentials: {
            clientId: 'id',
            clientSecret: 'secret',
            scope: '  read write  '
          }
        })

        expect(mockEnvFileAdapter.writeOAuthCredentials).toHaveBeenCalledWith(
          '/repo',
          'hubspot',
          expect.objectContaining({
            scope: 'read write'
          })
        )
      })

      it('should set scope to undefined if not provided', async () => {
        await useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot',
          credentials: {
            clientId: 'id',
            clientSecret: 'secret'
          }
        })

        expect(mockEnvFileAdapter.writeOAuthCredentials).toHaveBeenCalledWith(
          '/repo',
          'hubspot',
          expect.objectContaining({
            scope: undefined
          })
        )
      })
    })

    describe('successful write', () => {
      it('should return success result from adapter', async () => {
        const result = await useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot',
          credentials: { clientId: 'id', clientSecret: 'secret' }
        })

        expect(result.success).toBe(true)
        expect(result.path).toBe('/repo/backend/.env')
        expect(result.moduleName).toBe('hubspot')
        expect(result.written).toEqual({
          HUBSPOT_CLIENT_ID: true,
          HUBSPOT_CLIENT_SECRET: true,
          HUBSPOT_SCOPE: false
        })
      })

      it('should include requiresReload flag', async () => {
        const result = await useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot',
          credentials: { clientId: 'id', clientSecret: 'secret' }
        })

        expect(result.requiresReload).toBe(true)
      })

      it('should include descriptive message', async () => {
        const result = await useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot',
          credentials: { clientId: 'id', clientSecret: 'secret' }
        })

        expect(result.message).toContain('/repo/backend/.env')
        expect(result.message).toContain('OAuth credentials written')
      })
    })

    describe('adapter errors', () => {
      it('should propagate adapter errors', async () => {
        mockEnvFileAdapter.writeOAuthCredentials.mockRejectedValue(
          new Error('Path traversal not allowed')
        )

        await expect(useCase.execute({
          repositoryPath: '/repo/../other',
          moduleName: 'hubspot',
          credentials: { clientId: 'id', clientSecret: 'secret' }
        })).rejects.toThrow('Path traversal not allowed')
      })

      it('should propagate file system errors', async () => {
        mockEnvFileAdapter.writeOAuthCredentials.mockRejectedValue(
          new Error('Permission denied')
        )

        await expect(useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot',
          credentials: { clientId: 'id', clientSecret: 'secret' }
        })).rejects.toThrow('Permission denied')
      })
    })
  })
})
