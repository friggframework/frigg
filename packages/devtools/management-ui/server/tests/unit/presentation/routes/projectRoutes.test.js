/**
 * Unit tests for Project Routes
 * Presentation Layer - Routes should handle HTTP concerns only, delegate to controllers
 */

import { jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'

describe('Project Routes - Presentation Layer', () => {
  let app
  let mockProjectController

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks()

    // Create mock controller with all required methods
    mockProjectController = {
      getRepositories: jest.fn((req, res) => res.json({ success: true, data: [] })),
      getProjectById: jest.fn((req, res) => res.json({ success: true, data: {} })),
      switchRepository: jest.fn((req, res) => res.json({ success: true })),
      getProjectDefinition: jest.fn((req, res) => res.json({ success: true, data: {} })),
      getGitBranches: jest.fn((req, res) => res.json({ success: true, data: [] })),
      getGitStatus: jest.fn((req, res) => res.json({ success: true, data: {} })),
      switchGitBranch: jest.fn((req, res) => res.json({ success: true })),
      openInIDE: jest.fn((req, res) => res.json({ success: true })),
      getAvailableIDEs: jest.fn((req, res) => res.json({ success: true, data: {} })),
      startProject: jest.fn((req, res) => res.json({ success: true })),
      stopProject: jest.fn((req, res) => res.json({ success: true })),
      getStatus: jest.fn((req, res) => res.json({ success: true, data: {} })),
      getEnvironment: jest.fn((req, res) => res.json({ success: true, data: {} })),
      debugRepository: jest.fn((req, res) => res.json({ success: true })),
      _findProjectPathById: jest.fn().mockResolvedValue('/Users/test/project')
    }

    // Import and create routes
    const { createProjectRoutes } = await import('../../../../src/presentation/routes/projectRoutes.js')
    const router = createProjectRoutes(mockProjectController)

    // Create Express app
    app = express()
    app.use(express.json())
    app.use('/api/projects', router)
  })

  describe('GET /api/projects - List Projects', () => {
    it('should return list of projects', async () => {
      mockProjectController.getRepositories.mockImplementation((req, res) => {
        res.json({
          success: true,
          data: [
            { id: '1a7501a0', name: 'project1', path: '/Users/test/project1' },
            { id: 'abc123de', name: 'project2', path: '/Users/test/project2' }
          ]
        })
      })

      const response = await request(app).get('/api/projects')

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveLength(2)
      expect(mockProjectController.getRepositories).toHaveBeenCalled()
    })
  })

  describe('GET /api/projects/:id - Get Project by ID', () => {
    it('should return project details for valid ID', async () => {
      mockProjectController.getProjectById.mockImplementation((req, res) => {
        res.json({
          success: true,
          data: {
            id: '1a7501a0',
            name: 'test-project',
            path: '/Users/test/project',
            integrations: []
          }
        })
      })

      const response = await request(app).get('/api/projects/1a7501a0')

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(mockProjectController.getProjectById).toHaveBeenCalled()
    })

    it('should return 400 for invalid project ID format', async () => {
      const response = await request(app).get('/api/projects/invalid-id-format')

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.error).toBe('Invalid project ID format')
      expect(mockProjectController.getProjectById).not.toHaveBeenCalled()
    })

    it('should validate 8-character hex format', async () => {
      const invalidIds = ['123', '1234567', '123456789', 'gggggggg', '1234567G']

      for (const id of invalidIds) {
        const response = await request(app).get(`/api/projects/${id}`)
        expect(response.status).toBe(400)
        expect(response.body.error).toBe('Invalid project ID format')
      }
    })
  })

  describe('GET /api/projects/:id/git/branches - Git Operations', () => {
    it('should return git branches for valid project', async () => {
      mockProjectController.getGitBranches.mockImplementation((req, res) => {
        res.json({
          success: true,
          data: {
            current: 'main',
            branches: ['main', 'develop', 'feature/test']
          }
        })
      })

      const response = await request(app).get('/api/projects/1a7501a0/git/branches')

      expect(response.status).toBe(200)
      expect(response.body.data.current).toBe('main')
      expect(mockProjectController.getGitBranches).toHaveBeenCalled()
    })

    it('should validate project ID before calling controller', async () => {
      const response = await request(app).get('/api/projects/invalid/git/branches')

      expect(response.status).toBe(400)
      expect(mockProjectController.getGitBranches).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/projects/:id/git/status - Git Status', () => {
    it('should return git status', async () => {
      mockProjectController.getGitStatus.mockImplementation((req, res) => {
        res.json({
          success: true,
          data: {
            currentBranch: 'main',
            status: { staged: 0, unstaged: 2, untracked: 1 }
          }
        })
      })

      const response = await request(app).get('/api/projects/1a7501a0/git/status')

      expect(response.status).toBe(200)
      expect(response.body.data.currentBranch).toBe('main')
      expect(mockProjectController.getGitStatus).toHaveBeenCalled()
    })
  })

  describe('PATCH /api/projects/:id/git/current-branch - Switch Branch', () => {
    it('should switch git branch', async () => {
      mockProjectController.switchGitBranch.mockImplementation((req, res) => {
        res.json({ success: true, message: 'Switched to branch develop' })
      })

      const response = await request(app)
        .patch('/api/projects/1a7501a0/git/current-branch')
        .send({ branch: 'develop' })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(mockProjectController.switchGitBranch).toHaveBeenCalled()
    })

    it('should validate project ID', async () => {
      const response = await request(app)
        .patch('/api/projects/invalid/git/current-branch')
        .send({ branch: 'develop' })

      expect(response.status).toBe(400)
      expect(mockProjectController.switchGitBranch).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/projects/:id/ide-sessions - Open in IDE', () => {
    it('should open project in IDE with valid ID', async () => {
      mockProjectController._findProjectPathById.mockResolvedValue('/Users/test/project')
      mockProjectController.openInIDE.mockImplementation((req, res) => {
        res.json({ success: true, message: 'Opened in IDE' })
      })

      const response = await request(app)
        .post('/api/projects/1a7501a0/ide-sessions')
        .send({ ide: 'vscode' })

      expect(response.status).toBe(200)
      expect(mockProjectController._findProjectPathById).toHaveBeenCalledWith('1a7501a0')
      expect(mockProjectController.openInIDE).toHaveBeenCalled()
    })

    it('should return 404 when project not found', async () => {
      mockProjectController._findProjectPathById.mockResolvedValue(null)

      const response = await request(app)
        .post('/api/projects/1a7501a0/ide-sessions')
        .send({ ide: 'vscode' })

      expect(response.status).toBe(404)
      expect(response.body.error).toBe('Project not found')
      expect(mockProjectController.openInIDE).not.toHaveBeenCalled()
    })

    it('should use project path as default when no path in body', async () => {
      mockProjectController._findProjectPathById.mockResolvedValue('/Users/test/project')
      mockProjectController.openInIDE.mockImplementation((req, res) => {
        // Verify path was set in request body
        expect(req.body.path).toBe('/Users/test/project')
        res.json({ success: true })
      })

      const response = await request(app)
        .post('/api/projects/1a7501a0/ide-sessions')
        .send({ ide: 'vscode' })

      expect(response.status).toBe(200)
    })

    it('should preserve custom path from request body', async () => {
      mockProjectController._findProjectPathById.mockResolvedValue('/Users/test/project')
      mockProjectController.openInIDE.mockImplementation((req, res) => {
        expect(req.body.path).toBe('/Users/test/project/src/file.js')
        res.json({ success: true })
      })

      const response = await request(app)
        .post('/api/projects/1a7501a0/ide-sessions')
        .send({
          ide: 'vscode',
          path: '/Users/test/project/src/file.js'
        })

      expect(response.status).toBe(200)
    })
  })

  describe('GET /api/projects/ides/available - Available IDEs', () => {
    it('should return available IDEs', async () => {
      mockProjectController.getAvailableIDEs.mockImplementation((req, res) => {
        res.json({
          success: true,
          data: {
            ides: {
              vscode: { id: 'vscode', name: 'Visual Studio Code', available: true },
              cursor: { id: 'cursor', name: 'Cursor', available: true }
            }
          }
        })
      })

      const response = await request(app).get('/api/projects/ides/available')

      expect(response.status).toBe(200)
      expect(response.body.data.ides).toBeDefined()
      expect(mockProjectController.getAvailableIDEs).toHaveBeenCalled()
    })
  })

  describe('POST /api/projects/:id/frigg/executions - Start Frigg Process', () => {
    it('should start frigg execution', async () => {
      mockProjectController.startProject.mockImplementation((req, res) => {
        res.json({
          success: true,
          data: {
            executionId: '12345',
            pid: 12345,
            port: 3001,
            friggBaseUrl: 'http://localhost:3001'
          }
        })
      })

      const response = await request(app)
        .post('/api/projects/1a7501a0/frigg/executions')
        .send({ port: 3001 })

      expect(response.status).toBe(200)
      expect(response.body.data.executionId).toBe('12345')
      expect(mockProjectController.startProject).toHaveBeenCalled()
    })

    it('should validate project ID', async () => {
      const response = await request(app)
        .post('/api/projects/invalid/frigg/executions')
        .send({ port: 3001 })

      expect(response.status).toBe(400)
      expect(mockProjectController.startProject).not.toHaveBeenCalled()
    })
  })

  describe('DELETE /api/projects/:id/frigg/executions/:executionId - Stop Execution', () => {
    it('should stop specific execution', async () => {
      mockProjectController.stopProject.mockImplementation((req, res) => {
        res.json({ success: true, message: 'Execution stopped' })
      })

      const response = await request(app)
        .delete('/api/projects/1a7501a0/frigg/executions/12345')

      expect(response.status).toBe(200)
      expect(mockProjectController.stopProject).toHaveBeenCalled()
    })

    it('should validate project ID', async () => {
      const response = await request(app)
        .delete('/api/projects/invalid/frigg/executions/12345')

      expect(response.status).toBe(400)
      expect(mockProjectController.stopProject).not.toHaveBeenCalled()
    })
  })

  describe('DELETE /api/projects/:id/frigg/executions/current - Stop Current', () => {
    it('should stop current execution', async () => {
      mockProjectController.stopProject.mockImplementation((req, res) => {
        res.json({ success: true, message: 'Current execution stopped' })
      })

      const response = await request(app)
        .delete('/api/projects/1a7501a0/frigg/executions/current')

      expect(response.status).toBe(200)
      expect(mockProjectController.stopProject).toHaveBeenCalled()
    })
  })

  describe('GET /api/projects/:id/frigg/executions/:executionId/status - Execution Status', () => {
    it('should return execution status', async () => {
      mockProjectController.getStatus.mockImplementation((req, res) => {
        res.json({
          success: true,
          data: {
            isRunning: true,
            pid: 12345,
            port: 3001,
            uptime: 3600
          }
        })
      })

      const response = await request(app)
        .get('/api/projects/1a7501a0/frigg/executions/12345/status')

      expect(response.status).toBe(200)
      expect(response.body.data.isRunning).toBe(true)
      expect(mockProjectController.getStatus).toHaveBeenCalled()
    })

    it('should validate project ID', async () => {
      const response = await request(app)
        .get('/api/projects/invalid/frigg/executions/12345/status')

      expect(response.status).toBe(400)
      expect(mockProjectController.getStatus).not.toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should pass errors to next middleware', async () => {
      mockProjectController.getProjectById.mockImplementation((req, res, next) => {
        next(new Error('Database error'))
      })

      const response = await request(app).get('/api/projects/1a7501a0')

      // Without error handler middleware, Express sends 500
      expect(response.status).toBe(500)
    })
  })

  describe('HTTP Method Validation', () => {
    it('should reject invalid HTTP methods', async () => {
      const response = await request(app)
        .put('/api/projects/1a7501a0')
        .send({})

      expect(response.status).toBe(404)
    })
  })
})
