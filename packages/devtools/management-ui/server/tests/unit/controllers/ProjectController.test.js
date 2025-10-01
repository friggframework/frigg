import { jest } from '@jest/globals'
import { ProjectController } from '../../../src/presentation/controllers/ProjectController.js'
import { ProcessConflictError } from '../../../src/domain/errors/ProcessConflictError.js'

describe('ProjectController - startProject', () => {
  let controller
  let mockProjectService
  let mockInspectProjectUseCase
  let mockGitService
  let req
  let res
  let next

  beforeEach(() => {
    // Mock services
    mockProjectService = {
      startProject: jest.fn(),
      stopProject: jest.fn(),
      getStatus: jest.fn()
    }

    mockInspectProjectUseCase = {
      execute: jest.fn()
    }

    mockGitService = {
      getStatus: jest.fn()
    }

    controller = new ProjectController({
      projectService: mockProjectService,
      inspectProjectUseCase: mockInspectProjectUseCase,
      gitService: mockGitService
    })

    // Mock Express request/response
    req = {
      params: { id: '1a7501a0' },
      body: { port: 3000, env: {} },
      app: {
        locals: { projectPath: '/test/project' }
      }
    }

    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    }

    next = jest.fn()
  })

  describe('Successful Start', () => {
    it('should return actual detected port from ProcessManager', async () => {
      mockProjectService.startProject.mockResolvedValue({
        success: true,
        isRunning: true,
        status: 'running',
        pid: 63083,
        port: 3001, // Actual detected port
        baseUrl: 'http://localhost:3001',
        startTime: '2025-09-30T18:59:24.969Z',
        uptime: 0,
        repositoryPath: '/test/project/backend',
        message: 'Frigg project started successfully'
      })

      await controller.startProject(req, res, next)

      expect(mockProjectService.startProject).toHaveBeenCalledWith(
        '1a7501a0',
        { port: 3000, env: {} }
      )

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Frigg project started successfully',
        data: {
          executionId: '63083',
          pid: 63083,
          startedAt: '2025-09-30T18:59:24.969Z',
          port: 3001, // Should be detected port, not requested 3000
          friggBaseUrl: 'http://localhost:3001',
          websocketUrl: 'ws://localhost:8080/api/projects/1a7501a0/frigg/executions/63083/logs'
        }
      })
    })

    it('should use baseUrl from result if provided', async () => {
      mockProjectService.startProject.mockResolvedValue({
        success: true,
        pid: 12345,
        port: 3001,
        baseUrl: 'http://localhost:3001', // Provided by ProcessManager
        startTime: '2025-09-30T18:59:24.969Z'
      })

      await controller.startProject(req, res, next)

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            friggBaseUrl: 'http://localhost:3001'
          })
        })
      )
    })
  })

  describe('Process Conflict Handling', () => {
    it('should return 409 status when ProcessConflictError thrown', async () => {
      const conflictError = new ProcessConflictError(
        'A Frigg process is already running (PID: 58118, Port: 3001)',
        { pid: 58118, port: 3001 }
      )

      mockProjectService.startProject.mockRejectedValue(conflictError)

      await controller.startProject(req, res, next)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'A Frigg process is already running (PID: 58118, Port: 3001)',
        conflict: true,
        existingProcess: {
          pid: 58118,
          port: 3001
        }
      })

      // Should not call next() middleware
      expect(next).not.toHaveBeenCalled()
    })

    it('should include conflict flag for frontend detection', async () => {
      const conflictError = new ProcessConflictError(
        'Process already running',
        { pid: 12345, port: 3000 }
      )

      mockProjectService.startProject.mockRejectedValue(conflictError)

      await controller.startProject(req, res, next)

      const response = res.json.mock.calls[0][0]
      expect(response.conflict).toBe(true)
      expect(response.success).toBe(false)
      expect(response.existingProcess).toEqual({
        pid: 12345,
        port: 3000
      })
    })
  })

  describe('Other Errors', () => {
    it('should pass non-conflict errors to next middleware', async () => {
      const genericError = new Error('Something else went wrong')

      mockProjectService.startProject.mockRejectedValue(genericError)

      await controller.startProject(req, res, next)

      expect(next).toHaveBeenCalledWith(genericError)
      expect(res.status).not.toHaveBeenCalled()
      expect(res.json).not.toHaveBeenCalled()
    })

    it('should handle validation errors for invalid port', async () => {
      req.body.port = 99999

      await controller.startProject(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'port parameter must be a number between 1 and 65535'
      })
    })

    it('should handle project not found', async () => {
      req.params.id = 'nonexistent'

      mockProjectService.startProject.mockRejectedValue(
        new Error('Project with ID "nonexistent" not found')
      )

      await controller.startProject(req, res, next)

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('not found')
        })
      )
    })
  })

  describe('Request Parameter Handling', () => {
    it('should handle missing port parameter with default', async () => {
      req.body = {} // No port specified

      mockProjectService.startProject.mockResolvedValue({
        success: true,
        pid: 12345,
        port: 3000, // ProcessManager detects and returns the actual port
        startTime: new Date().toISOString()
      })

      await controller.startProject(req, res, next)

      // Controller passes undefined to service, service/ProcessManager determines actual port
      expect(mockProjectService.startProject).toHaveBeenCalledWith(
        '1a7501a0',
        { port: undefined, env: {} }
      )

      // But response should have the detected port (3000)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            port: 3000
          })
        })
      )
    })

    it('should pass custom environment variables', async () => {
      req.body = {
        port: 3000,
        env: {
          MONGO_URI: 'mongodb://localhost:27017',
          DEBUG: 'true'
        }
      }

      mockProjectService.startProject.mockResolvedValue({
        success: true,
        pid: 12345,
        port: 3000,
        startTime: new Date().toISOString()
      })

      await controller.startProject(req, res, next)

      expect(mockProjectService.startProject).toHaveBeenCalledWith(
        '1a7501a0',
        {
          port: 3000,
          env: {
            MONGO_URI: 'mongodb://localhost:27017',
            DEBUG: 'true'
          }
        }
      )
    })

    it('should handle legacy path-based requests', async () => {
      req.params = {} // No ID
      req.app.locals.projectPath = '/legacy/project/path'

      mockProjectService.startProject.mockResolvedValue({
        success: true,
        pid: 12345,
        port: 3000,
        startTime: new Date().toISOString()
      })

      await controller.startProject(req, res, next)

      // Should still work with path
      expect(mockProjectService.startProject).toHaveBeenCalled()
    })
  })

  describe('WebSocket URL Generation', () => {
    it('should generate execution-specific websocket URL', async () => {
      mockProjectService.startProject.mockResolvedValue({
        success: true,
        pid: 63083,
        port: 3001,
        startTime: new Date().toISOString()
      })

      await controller.startProject(req, res, next)

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            websocketUrl: 'ws://localhost:8080/api/projects/1a7501a0/frigg/executions/63083/logs'
          })
        })
      )
    })

    it('should use legacy websocket URL when no project ID', async () => {
      req.params = {} // No ID

      mockProjectService.startProject.mockResolvedValue({
        success: true,
        pid: 12345,
        port: 3000,
        startTime: new Date().toISOString()
      })

      await controller.startProject(req, res, next)

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            websocketUrl: 'ws://localhost:8080/logs'
          })
        })
      )
    })
  })
})
