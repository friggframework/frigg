import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CheckOAuthCredentialsUseCase } from '../../../../../src/application/use-cases/frigg-app/CheckOAuthCredentialsUseCase.js'

describe('CheckOAuthCredentialsUseCase', () => {
  let mockEnvFileAdapter
  let useCase

  beforeEach(() => {
    mockEnvFileAdapter = {
      checkOAuthCredentials: vi.fn()
    }

    useCase = new CheckOAuthCredentialsUseCase({
      envFileAdapter: mockEnvFileAdapter
    })
  })

  describe('execute', () => {
    describe('input validation', () => {
      it('should throw error when repositoryPath is missing', async () => {
        await expect(useCase.execute({
          repositoryPath: null,
          moduleName: 'hubspot'
        })).rejects.toThrow('Repository path is required')
      })

      it('should throw error when repositoryPath is empty', async () => {
        await expect(useCase.execute({
          repositoryPath: '',
          moduleName: 'hubspot'
        })).rejects.toThrow('Repository path is required')
      })

      it('should throw error when moduleName is missing', async () => {
        await expect(useCase.execute({
          repositoryPath: '/some/path',
          moduleName: null
        })).rejects.toThrow('Module name is required')
      })

      it('should throw error when moduleName is empty', async () => {
        await expect(useCase.execute({
          repositoryPath: '/some/path',
          moduleName: ''
        })).rejects.toThrow('Module name is required')
      })
    })

    describe('module name normalization', () => {
      it('should convert module name to lowercase', async () => {
        mockEnvFileAdapter.checkOAuthCredentials.mockResolvedValue({
          complete: true,
          missing: [],
          varNames: { clientId: 'HUBSPOT_CLIENT_ID', clientSecret: 'HUBSPOT_CLIENT_SECRET', scope: 'HUBSPOT_SCOPE' },
          values: { clientId: 'id', clientSecret: 'secret', scope: null }
        })

        await useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'HubSpot'
        })

        expect(mockEnvFileAdapter.checkOAuthCredentials).toHaveBeenCalledWith(
          '/repo',
          'hubspot'
        )
      })

      it('should remove special characters from module name', async () => {
        mockEnvFileAdapter.checkOAuthCredentials.mockResolvedValue({
          complete: true,
          missing: [],
          varNames: { clientId: 'MYMODULE_CLIENT_ID', clientSecret: 'MYMODULE_CLIENT_SECRET', scope: 'MYMODULE_SCOPE' },
          values: { clientId: 'id', clientSecret: 'secret', scope: null }
        })

        await useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'my@module!'
        })

        expect(mockEnvFileAdapter.checkOAuthCredentials).toHaveBeenCalledWith(
          '/repo',
          'mymodule'
        )
      })

      it('should preserve hyphens and underscores', async () => {
        mockEnvFileAdapter.checkOAuthCredentials.mockResolvedValue({
          complete: true,
          missing: [],
          varNames: { clientId: 'MY_CUSTOM_MODULE_CLIENT_ID', clientSecret: 'MY_CUSTOM_MODULE_CLIENT_SECRET', scope: 'MY_CUSTOM_MODULE_SCOPE' },
          values: { clientId: 'id', clientSecret: 'secret', scope: null }
        })

        await useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'my-custom_module'
        })

        expect(mockEnvFileAdapter.checkOAuthCredentials).toHaveBeenCalledWith(
          '/repo',
          'my-custom_module'
        )
      })
    })

    describe('complete credentials', () => {
      it('should return complete=true when all required credentials exist', async () => {
        mockEnvFileAdapter.checkOAuthCredentials.mockResolvedValue({
          complete: true,
          missing: [],
          varNames: {
            clientId: 'HUBSPOT_CLIENT_ID',
            clientSecret: 'HUBSPOT_CLIENT_SECRET',
            scope: 'HUBSPOT_SCOPE'
          },
          values: {
            clientId: 'my-client-id',
            clientSecret: 'my-secret',
            scope: 'read write'
          }
        })

        const result = await useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot'
        })

        expect(result.complete).toBe(true)
        expect(result.missing).toEqual([])
        expect(result.hasClientId).toBe(true)
        expect(result.hasClientSecret).toBe(true)
        expect(result.hasScope).toBe(true)
        expect(result.message).toBe('OAuth credentials are configured')
      })

      it('should not expose actual credential values in response', async () => {
        mockEnvFileAdapter.checkOAuthCredentials.mockResolvedValue({
          complete: true,
          missing: [],
          varNames: {
            clientId: 'HUBSPOT_CLIENT_ID',
            clientSecret: 'HUBSPOT_CLIENT_SECRET',
            scope: 'HUBSPOT_SCOPE'
          },
          values: {
            clientId: 'secret-id',
            clientSecret: 'super-secret',
            scope: null
          }
        })

        const result = await useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot'
        })

        // Should not contain actual values
        expect(result.clientId).toBeUndefined()
        expect(result.clientSecret).toBeUndefined()
        expect(JSON.stringify(result)).not.toContain('secret-id')
        expect(JSON.stringify(result)).not.toContain('super-secret')
      })
    })

    describe('missing credentials', () => {
      it('should return complete=false when clientId is missing', async () => {
        mockEnvFileAdapter.checkOAuthCredentials.mockResolvedValue({
          complete: false,
          missing: ['clientId'],
          varNames: {
            clientId: 'HUBSPOT_CLIENT_ID',
            clientSecret: 'HUBSPOT_CLIENT_SECRET',
            scope: 'HUBSPOT_SCOPE'
          },
          values: {
            clientId: null,
            clientSecret: 'secret',
            scope: null
          }
        })

        const result = await useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot'
        })

        expect(result.complete).toBe(false)
        expect(result.missing).toContain('clientId')
        expect(result.hasClientId).toBe(false)
        expect(result.hasClientSecret).toBe(true)
        expect(result.message).toContain('HUBSPOT_CLIENT_ID')
      })

      it('should return complete=false when clientSecret is missing', async () => {
        mockEnvFileAdapter.checkOAuthCredentials.mockResolvedValue({
          complete: false,
          missing: ['clientSecret'],
          varNames: {
            clientId: 'HUBSPOT_CLIENT_ID',
            clientSecret: 'HUBSPOT_CLIENT_SECRET',
            scope: 'HUBSPOT_SCOPE'
          },
          values: {
            clientId: 'id',
            clientSecret: null,
            scope: null
          }
        })

        const result = await useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot'
        })

        expect(result.complete).toBe(false)
        expect(result.missing).toContain('clientSecret')
        expect(result.hasClientId).toBe(true)
        expect(result.hasClientSecret).toBe(false)
        expect(result.message).toContain('HUBSPOT_CLIENT_SECRET')
      })

      it('should list all missing credentials in message', async () => {
        mockEnvFileAdapter.checkOAuthCredentials.mockResolvedValue({
          complete: false,
          missing: ['clientId', 'clientSecret'],
          varNames: {
            clientId: 'SALESFORCE_CLIENT_ID',
            clientSecret: 'SALESFORCE_CLIENT_SECRET',
            scope: 'SALESFORCE_SCOPE'
          },
          values: {
            clientId: null,
            clientSecret: null,
            scope: null
          }
        })

        const result = await useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'salesforce'
        })

        expect(result.message).toContain('SALESFORCE_CLIENT_ID')
        expect(result.message).toContain('SALESFORCE_CLIENT_SECRET')
      })
    })

    describe('response structure', () => {
      it('should include envVarNames in response', async () => {
        mockEnvFileAdapter.checkOAuthCredentials.mockResolvedValue({
          complete: true,
          missing: [],
          varNames: {
            clientId: 'HUBSPOT_CLIENT_ID',
            clientSecret: 'HUBSPOT_CLIENT_SECRET',
            scope: 'HUBSPOT_SCOPE'
          },
          values: { clientId: 'id', clientSecret: 'secret', scope: null }
        })

        const result = await useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'hubspot'
        })

        expect(result.envVarNames).toEqual({
          clientId: 'HUBSPOT_CLIENT_ID',
          clientSecret: 'HUBSPOT_CLIENT_SECRET',
          scope: 'HUBSPOT_SCOPE'
        })
      })

      it('should include normalized moduleName in response', async () => {
        mockEnvFileAdapter.checkOAuthCredentials.mockResolvedValue({
          complete: true,
          missing: [],
          varNames: {
            clientId: 'HUBSPOT_CLIENT_ID',
            clientSecret: 'HUBSPOT_CLIENT_SECRET',
            scope: 'HUBSPOT_SCOPE'
          },
          values: { clientId: 'id', clientSecret: 'secret', scope: null }
        })

        const result = await useCase.execute({
          repositoryPath: '/repo',
          moduleName: 'HUBSPOT'
        })

        expect(result.moduleName).toBe('hubspot')
      })
    })
  })
})
