/**
 * IntegrationService Application Layer Tests
 * Testing use case orchestration and business logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IntegrationService } from '../../application/services/IntegrationService.js'
import { Integration } from '../../domain/entities/Integration.js'

// Mock repository
const mockIntegrationRepository = {
  getAll: vi.fn(),
  getByName: vi.fn(),
  install: vi.fn(),
  uninstall: vi.fn(),
  updateConfig: vi.fn(),
  checkConnection: vi.fn()
}

describe('IntegrationService Application Layer', () => {
  let integrationService

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Create service with mock repository
    integrationService = new IntegrationService(mockIntegrationRepository)
  })

  describe('listIntegrations', () => {
    it('should return all integrations from repository', async () => {
      const mockIntegrations = [
        { name: 'salesforce', type: 'api', status: 'active' },
        { name: 'github', type: 'git', status: 'inactive' }
      ]

      mockIntegrationRepository.getAll.mockResolvedValue(mockIntegrations)

      const result = await integrationService.listIntegrations()

      expect(mockIntegrationRepository.getAll).toHaveBeenCalledOnce()
      expect(result).toEqual(mockIntegrations)
    })

    it('should handle repository errors', async () => {
      const error = new Error('Repository error')
      mockIntegrationRepository.getAll.mockRejectedValue(error)

      await expect(integrationService.listIntegrations()).rejects.toThrow('Repository error')
    })

    it('should return empty array when no integrations', async () => {
      mockIntegrationRepository.getAll.mockResolvedValue([])

      const result = await integrationService.listIntegrations()

      expect(result).toEqual([])
    })
  })

  describe('getIntegration', () => {
    it('should return integration by name', async () => {
      const mockIntegration = { name: 'salesforce', type: 'api', status: 'active' }
      mockIntegrationRepository.getByName.mockResolvedValue(mockIntegration)

      const result = await integrationService.getIntegration('salesforce')

      expect(mockIntegrationRepository.getByName).toHaveBeenCalledWith('salesforce')
      expect(result).toEqual(mockIntegration)
    })

    it('should return null when integration not found', async () => {
      mockIntegrationRepository.getByName.mockResolvedValue(null)

      const result = await integrationService.getIntegration('nonexistent')

      expect(result).toBeNull()
    })

    it('should handle repository errors', async () => {
      const error = new Error('Integration not found')
      mockIntegrationRepository.getByName.mockRejectedValue(error)

      await expect(integrationService.getIntegration('salesforce')).rejects.toThrow('Integration not found')
    })
  })

  describe('installIntegration', () => {
    it('should install integration successfully', async () => {
      const mockIntegration = { name: 'salesforce', type: 'api', status: 'active' }
      mockIntegrationRepository.install.mockResolvedValue(mockIntegration)

      const result = await integrationService.installIntegration('salesforce')

      expect(mockIntegrationRepository.install).toHaveBeenCalledWith('salesforce')
      expect(result).toEqual(mockIntegration)
    })

    it('should handle installation errors', async () => {
      const error = new Error('Installation failed')
      mockIntegrationRepository.install.mockRejectedValue(error)

      await expect(integrationService.installIntegration('salesforce')).rejects.toThrow('Installation failed')
    })
  })

  describe('uninstallIntegration', () => {
    it('should uninstall integration successfully', async () => {
      mockIntegrationRepository.uninstall.mockResolvedValue(true)

      const result = await integrationService.uninstallIntegration('salesforce')

      expect(mockIntegrationRepository.uninstall).toHaveBeenCalledWith('salesforce')
      expect(result).toBe(true)
    })

    it('should validate integration name', async () => {
      await expect(integrationService.uninstallIntegration('')).rejects.toThrow('Integration name is required and must be a string')
      await expect(integrationService.uninstallIntegration(null)).rejects.toThrow('Integration name is required and must be a string')
      await expect(integrationService.uninstallIntegration(123)).rejects.toThrow('Integration name is required and must be a string')
    })

    it('should handle uninstallation errors', async () => {
      const error = new Error('Uninstallation failed')
      mockIntegrationRepository.uninstall.mockRejectedValue(error)

      await expect(integrationService.uninstallIntegration('salesforce')).rejects.toThrow('Uninstallation failed')
    })
  })

  describe('updateIntegrationConfig', () => {
    it('should update integration config successfully', async () => {
      const mockConfig = { apiKey: 'new-key' }
      const mockIntegration = { name: 'salesforce', config: mockConfig }
      mockIntegrationRepository.updateConfig.mockResolvedValue(mockIntegration)

      const result = await integrationService.updateIntegrationConfig('salesforce', mockConfig)

      expect(mockIntegrationRepository.updateConfig).toHaveBeenCalledWith('salesforce', mockConfig)
      expect(result).toEqual(mockIntegration)
    })

    it('should validate integration name', async () => {
      const config = { apiKey: 'test' }

      await expect(integrationService.updateIntegrationConfig('', config)).rejects.toThrow('Integration name is required and must be a string')
      await expect(integrationService.updateIntegrationConfig(null, config)).rejects.toThrow('Integration name is required and must be a string')
      await expect(integrationService.updateIntegrationConfig(123, config)).rejects.toThrow('Integration name is required and must be a string')
    })

    it('should validate config parameter', async () => {
      await expect(integrationService.updateIntegrationConfig('salesforce', null)).rejects.toThrow('Configuration is required and must be an object')
      await expect(integrationService.updateIntegrationConfig('salesforce', undefined)).rejects.toThrow('Configuration is required and must be an object')
      await expect(integrationService.updateIntegrationConfig('salesforce', 'string')).rejects.toThrow('Configuration is required and must be an object')
      await expect(integrationService.updateIntegrationConfig('salesforce', 123)).rejects.toThrow('Configuration is required and must be an object')
    })

    it('should handle config update errors', async () => {
      const error = new Error('Config update failed')
      mockIntegrationRepository.updateConfig.mockRejectedValue(error)

      await expect(integrationService.updateIntegrationConfig('salesforce', { key: 'value' })).rejects.toThrow('Config update failed')
    })
  })

  describe('checkIntegrationConnection', () => {
    it('should check connection successfully', async () => {
      mockIntegrationRepository.checkConnection.mockResolvedValue(true)

      const result = await integrationService.checkIntegrationConnection('salesforce')

      expect(mockIntegrationRepository.checkConnection).toHaveBeenCalledWith('salesforce')
      expect(result).toBe(true)
    })

    it('should return false for failed connection', async () => {
      mockIntegrationRepository.checkConnection.mockResolvedValue(false)

      const result = await integrationService.checkIntegrationConnection('salesforce')

      expect(result).toBe(false)
    })

    it('should validate integration name', async () => {
      await expect(integrationService.checkIntegrationConnection('')).rejects.toThrow('Integration name is required and must be a string')
      await expect(integrationService.checkIntegrationConnection(null)).rejects.toThrow('Integration name is required and must be a string')
      await expect(integrationService.checkIntegrationConnection(123)).rejects.toThrow('Integration name is required and must be a string')
    })

    it('should handle connection check errors', async () => {
      const error = new Error('Connection check failed')
      mockIntegrationRepository.checkConnection.mockRejectedValue(error)

      await expect(integrationService.checkIntegrationConnection('salesforce')).rejects.toThrow('Connection check failed')
    })
  })

  describe('service initialization', () => {
    it('should initialize use cases correctly', () => {
      expect(integrationService.listIntegrationsUseCase).toBeDefined()
      expect(integrationService.installIntegrationUseCase).toBeDefined()
    })

    it('should pass repository to use cases', () => {
      expect(integrationService.listIntegrationsUseCase.integrationRepository).toBe(mockIntegrationRepository)
      expect(integrationService.installIntegrationUseCase.integrationRepository).toBe(mockIntegrationRepository)
    })
  })

  describe('error handling', () => {
    it('should propagate domain validation errors', async () => {
      const domainError = new Error('Domain validation failed')
      mockIntegrationRepository.install.mockRejectedValue(domainError)

      await expect(integrationService.installIntegration('invalid')).rejects.toThrow('Domain validation failed')
    })

    it('should propagate infrastructure errors', async () => {
      const infraError = new Error('API call failed')
      mockIntegrationRepository.getAll.mockRejectedValue(infraError)

      await expect(integrationService.listIntegrations()).rejects.toThrow('API call failed')
    })
  })

  describe('integration with Use Cases', () => {
    it('should delegate to ListIntegrationsUseCase', async () => {
      const mockIntegrations = [{ name: 'test', type: 'api' }]
      mockIntegrationRepository.getAll.mockResolvedValue(mockIntegrations)

      const result = await integrationService.listIntegrations()

      expect(result).toEqual(mockIntegrations)
      expect(mockIntegrationRepository.getAll).toHaveBeenCalledOnce()
    })

    it('should delegate to InstallIntegrationUseCase', async () => {
      const mockIntegration = { name: 'test', type: 'api', status: 'active' }
      mockIntegrationRepository.install.mockResolvedValue(mockIntegration)

      const result = await integrationService.installIntegration('test')

      expect(result).toEqual(mockIntegration)
      expect(mockIntegrationRepository.install).toHaveBeenCalledWith('test')
    })
  })
})