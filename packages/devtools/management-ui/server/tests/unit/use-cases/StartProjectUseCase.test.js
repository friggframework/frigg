/**
 * Unit tests for StartProjectUseCase
 * Application Layer - Use Cases orchestrate business logic using domain services
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Use vi.hoisted to create mock that can be referenced in vi.mock
const { mockExistsSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(() => true)
}))

// Mock fs module - vi.mock is hoisted, but can reference vi.hoisted values
vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  default: {
    existsSync: mockExistsSync
  }
}))

import { StartProjectUseCase } from '../../../src/application/use-cases/StartProjectUseCase.js'
import { ProcessConflictError } from '../../../src/domain/errors/ProcessConflictError.js'

describe('StartProjectUseCase', () => {
  let useCase
  let mockProcessManager
  let mockWebSocketService
  let mockFindProjectByIdUseCase

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Mock existsSync to always return true by default
    mockExistsSync.mockReturnValue(true)

    // Mock ProcessManager
    mockProcessManager = {
      isRunning: vi.fn(),
      getStatus: vi.fn(),
      start: vi.fn()
    }

    // Mock WebSocketService
    mockWebSocketService = {
      emit: vi.fn()
    }

    // Mock FindProjectByIdUseCase
    mockFindProjectByIdUseCase = {
      execute: vi.fn()
    }

    useCase = new StartProjectUseCase({
      processManager: mockProcessManager,
      webSocketService: mockWebSocketService,
      findProjectByIdUseCase: mockFindProjectByIdUseCase
    })
  })

  describe('execute - Process Conflict Handling', () => {
    it('should throw ProcessConflictError when process already running', async () => {
      mockProcessManager.isRunning.mockReturnValue(true)
      mockProcessManager.getStatus.mockReturnValue({
        pid: 12345,
        port: 3001
      })

      await expect(
        useCase.execute('/test/project')
      ).rejects.toThrow(ProcessConflictError)

      await expect(
        useCase.execute('/test/project')
      ).rejects.toThrow('A Frigg process is already running (PID: 12345, Port: 3001)')
    })

    it('should include existing process info in conflict error', async () => {
      mockProcessManager.isRunning.mockReturnValue(true)
      mockProcessManager.getStatus.mockReturnValue({
        pid: 58118,
        port: 3001
      })

      try {
        await useCase.execute('/test/project')
        expect.fail('Should have thrown ProcessConflictError')
      } catch (error) {
        expect(error).toBeInstanceOf(ProcessConflictError)
        expect(error.statusCode).toBe(409)
        expect(error.existingProcess).toEqual({
          pid: 58118,
          port: 3001
        })
      }
    })
  })

  describe('execute - Successful Start', () => {
    beforeEach(() => {
      mockProcessManager.isRunning.mockReturnValue(false)
    })

    it('should start process and return status with detected port', async () => {
      const mockStatus = {
        isRunning: true,
        status: 'running',
        pid: 63083,
        port: 3001, // Actual detected port, not requested
        baseUrl: 'http://localhost:3001',
        startTime: '2025-09-30T18:59:24.969Z',
        uptime: 0,
        repositoryPath: '/test/project/backend'
      }

      mockProcessManager.start.mockResolvedValue(mockStatus)

      const result = await useCase.execute('/test/project', { port: 3000 })

      expect(result).toMatchObject({
        success: true,
        isRunning: true,
        pid: 63083,
        port: 3001, // Should be detected port, not requested 3000
        baseUrl: 'http://localhost:3001',
        message: 'Frigg project started successfully'
      })
    })
  })

  describe('execute - Error Handling', () => {
    beforeEach(() => {
      mockProcessManager.isRunning.mockReturnValue(false)
    })

    it('should throw error when project ID or path not provided', async () => {
      await expect(
        useCase.execute()
      ).rejects.toThrow('Project ID or path is required')

      await expect(
        useCase.execute(null)
      ).rejects.toThrow('Project ID or path is required')

      await expect(
        useCase.execute('')
      ).rejects.toThrow('Project ID or path is required')
    })

    it('should throw error when path does not exist', async () => {
      mockExistsSync.mockReturnValue(false)

      await expect(
        useCase.execute('/nonexistent/path')
      ).rejects.toThrow('Repository path does not exist')
    })
  })

  describe('Dependency Injection', () => {
    it('should store processManager', () => {
      expect(useCase.processManager).toBe(mockProcessManager)
    })

    it('should store webSocketService', () => {
      expect(useCase.webSocketService).toBe(mockWebSocketService)
    })

    it('should store findProjectByIdUseCase', () => {
      expect(useCase.findProjectByIdUseCase).toBe(mockFindProjectByIdUseCase)
    })
  })

  describe('execute - Project ID Resolution via FindProjectByIdUseCase', () => {
    beforeEach(() => {
      mockProcessManager.isRunning.mockReturnValue(false)
    })

    it('should use FindProjectByIdUseCase to resolve 8-char hex IDs', async () => {
      const testPath = '/test/frigg-project/backend'
      mockFindProjectByIdUseCase.execute.mockResolvedValue({
        path: testPath,
        repository: { name: 'frigg-project' }
      })

      mockProcessManager.start.mockResolvedValue({
        isRunning: true,
        status: 'running',
        pid: 12345,
        port: 3001
      })

      const result = await useCase.execute('abcd1234')

      expect(mockFindProjectByIdUseCase.execute).toHaveBeenCalledWith({ id: 'abcd1234' })
      expect(result.success).toBe(true)
    })

    it('should throw error when FindProjectByIdUseCase returns null', async () => {
      mockFindProjectByIdUseCase.execute.mockResolvedValue(null)

      await expect(
        useCase.execute('abcd1234')
      ).rejects.toThrow('Project with ID "abcd1234" not found')
    })

    it('should not call FindProjectByIdUseCase for non-ID paths', async () => {
      mockProcessManager.start.mockResolvedValue({
        isRunning: true,
        status: 'running',
        pid: 12345,
        port: 3001
      })

      await useCase.execute('/test/project')

      expect(mockFindProjectByIdUseCase.execute).not.toHaveBeenCalled()
    })

    it('should throw error if FindProjectByIdUseCase is not available', async () => {
      const useCaseWithoutFindById = new StartProjectUseCase({
        processManager: mockProcessManager,
        webSocketService: mockWebSocketService
        // No findProjectByIdUseCase
      })

      await expect(
        useCaseWithoutFindById.execute('abcd1234')
      ).rejects.toThrow('FindProjectByIdUseCase is required to resolve project IDs')
    })

    it('should resolve backend path ID correctly', async () => {
      // Simulate FindProjectByIdUseCase returning a backend path
      const backendPath = '/test/repo/backend'
      mockFindProjectByIdUseCase.execute.mockResolvedValue({
        path: backendPath,
        repository: { name: 'repo', hasBackend: true }
      })

      mockProcessManager.start.mockResolvedValue({
        isRunning: true,
        status: 'running',
        pid: 12345,
        port: 3001,
        repositoryPath: backendPath
      })

      const result = await useCase.execute('19de1961')

      expect(mockFindProjectByIdUseCase.execute).toHaveBeenCalledWith({ id: '19de1961' })
      expect(result.success).toBe(true)
    })
  })
})
