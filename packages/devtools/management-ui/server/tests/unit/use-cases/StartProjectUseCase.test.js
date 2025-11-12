import { jest } from '@jest/globals'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Mock fs module BEFORE importing the code under test
jest.unstable_mockModule('fs', () => ({
  existsSync: jest.fn(() => true) // Default to true
}))

const { StartProjectUseCase } = await import('../../../src/application/use-cases/StartProjectUseCase.js')
const { ProcessConflictError } = await import('../../../src/domain/errors/ProcessConflictError.js')
const { existsSync } = await import('fs')

describe('StartProjectUseCase', () => {
  let useCase
  let mockProcessManager
  let mockWebSocketService

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Reset existsSync to return true by default
    existsSync.mockReturnValue(true)

    // Mock ProcessManager
    mockProcessManager = {
      isRunning: jest.fn(),
      getStatus: jest.fn(),
      start: jest.fn()
    }

    // Mock WebSocketService
    mockWebSocketService = {
      emit: jest.fn()
    }

    useCase = new StartProjectUseCase({
      processManager: mockProcessManager,
      webSocketService: mockWebSocketService
    })
  })

  describe('validateBackendPath', () => {
    it('should accept path with infrastructure.js in current directory', () => {
      // Mock infrastructure.js exists
      existsSync.mockReturnValue(true)

      const result = useCase.validateBackendPath(__dirname)
      expect(result).toBeDefined()
    })

    it('should throw error when no infrastructure.js found', () => {
      // Mock infrastructure.js doesn't exist
      existsSync.mockReturnValue(false)

      expect(() => {
        useCase.validateBackendPath('/tmp/nonexistent')
      }).toThrow('No valid Frigg backend found')
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

      expect(mockProcessManager.start).toHaveBeenCalledWith(
        expect.stringContaining('/test/project'),
        mockWebSocketService,
        { port: 3000 }
      )
    })

    it('should pass environment variables to process manager', async () => {
      mockProcessManager.start.mockResolvedValue({
        isRunning: true,
        pid: 12345,
        port: 3001
      })

      const customEnv = {
        MONGO_URI: 'mongodb://localhost:27017',
        DEBUG: 'true'
      }

      await useCase.execute('/test/project', {
        port: 3000,
        env: customEnv
      })

      expect(mockProcessManager.start).toHaveBeenCalledWith(
        expect.any(String),
        mockWebSocketService,
        { port: 3000, env: customEnv }
      )
    })
  })

  describe('execute - Project ID Resolution', () => {
    it('should resolve project ID to path', async () => {
      // Generate actual project ID for the test path
      const crypto = await import('crypto')
      const testPath = '/users/test/project1'
      const projectId = crypto.createHash('sha256').update(testPath).digest('hex').substring(0, 8)

      // Mock environment with available repositories
      process.env.AVAILABLE_REPOSITORIES = JSON.stringify([
        { path: testPath },
        { path: '/users/test/project2' }
      ])

      // Mock that the project path exists (need to check for both absolute and relative paths)
      existsSync.mockImplementation((path) => {
        // Check if path contains the project directory
        return path.includes('project1') || path.includes('infrastructure.js')
      })

      mockProcessManager.isRunning.mockReturnValue(false)
      mockProcessManager.start.mockResolvedValue({
        isRunning: true,
        pid: 12345,
        port: 3001
      })

      await useCase.execute(projectId)

      expect(mockProcessManager.start).toHaveBeenCalledWith(
        expect.stringContaining('project1'),
        mockWebSocketService,
        expect.any(Object)
      )

      delete process.env.AVAILABLE_REPOSITORIES
    })

    it('should throw error when project ID not found', async () => {
      process.env.AVAILABLE_REPOSITORIES = JSON.stringify([
        { path: '/users/test/project1', id: '1a7501a0' }
      ])

      mockProcessManager.isRunning.mockReturnValue(false)

      await expect(
        useCase.execute('99999999')
      ).rejects.toThrow('Project with ID "99999999" not found')

      delete process.env.AVAILABLE_REPOSITORIES
    })

    it('should accept direct path instead of ID', async () => {
      mockProcessManager.isRunning.mockReturnValue(false)
      mockProcessManager.start.mockResolvedValue({
        isRunning: true,
        pid: 12345,
        port: 3001
      })

      await useCase.execute('/users/test/direct/path')

      expect(mockProcessManager.start).toHaveBeenCalledWith(
        expect.stringContaining('/users/test/direct/path'),
        mockWebSocketService,
        expect.any(Object)
      )
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

    it('should throw error when repository path does not exist', async () => {
      // Mock path doesn't exist
      existsSync.mockReturnValue(false)

      await expect(
        useCase.execute('/nonexistent/path')
      ).rejects.toThrow('Repository path does not exist')
    })

    it('should wrap process manager errors', async () => {
      mockProcessManager.start.mockRejectedValue(
        new Error('Port already in use')
      )

      await expect(
        useCase.execute(__dirname)
      ).rejects.toThrow('Failed to start Frigg project: Port already in use')
    })
  })
})
