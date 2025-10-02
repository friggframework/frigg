/**
 * Integration tests for DDD/Hexagonal Architecture
 * Tests the full flow: Route → Controller → Use Case → Repository
 */

import { jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'
import path from 'path'

// Mock file system
jest.unstable_mockModule('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn()
}))

jest.unstable_mockModule('fs-extra', () => ({
  readJson: jest.fn(),
  writeJson: jest.fn(),
  ensureDir: jest.fn(),
  pathExists: jest.fn()
}))

const { existsSync, readdirSync } = await import('fs')
const fsExtra = await import('fs-extra')

describe('DDD/Hexagonal Architecture - Full Integration', () => {
  let app
  let container

  beforeEach(async () => {
    jest.clearAllMocks()

    // Mock file system for project detection
    existsSync.mockImplementation((testPath) => {
      // Mock project structure
      if (testPath.includes('test-project')) return true
      if (testPath.includes('package.json')) return true
      if (testPath.includes('infrastructure.js')) return true
      return false
    })

    fsExtra.readJson.mockResolvedValue({
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        '@friggframework/core': '^2.0.0'
      }
    })

    readdirSync.mockReturnValue([
      { name: 'hubspot', isDirectory: () => true },
      { name: 'salesforce', isDirectory: () => true }
    ])

    // Import container and create app
    const { createContainer } = await import('../../src/container.js')
    const { createProjectRoutes } = await import('../../src/presentation/routes/projectRoutes.js')

    container = createContainer()

    app = express()
    app.use(express.json())

    // Mount routes
    const projectRoutes = createProjectRoutes(container.projectController)
    app.use('/api/projects', projectRoutes)

    // Error handler
    app.use((err, req, res, next) => {
      res.status(err.statusCode || 500).json({
        success: false,
        error: err.message
      })
    })
  })

  describe('Project Inspection Flow', () => {
    it('should flow through all layers: Route → Controller → UseCase → Repository', async () => {
      // Setup mocks
      const mockProjectPath = '/Users/test/test-project/backend'

      process.env.AVAILABLE_REPOSITORIES = JSON.stringify([
        { path: mockProjectPath, id: '1a7501a0', name: 'test-project' }
      ])

      existsSync.mockReturnValue(true)

      fsExtra.readJson.mockImplementation(async (filePath) => {
        if (filePath.includes('package.json')) {
          return {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
              '@friggframework/core': '^2.0.0'
            }
          }
        }
        if (filePath.includes('hubspot')) {
          return {
            modules: {
              hubspot: { name: 'HubSpot', version: '1.0.0' }
            }
          }
        }
        if (filePath.includes('salesforce')) {
          return {
            modules: {
              salesforce: { name: 'Salesforce', version: '2.0.0' }
            }
          }
        }
        return {}
      })

      readdirSync.mockReturnValue([
        { name: 'hubspot', isDirectory: () => true },
        { name: 'salesforce', isDirectory: () => true }
      ])

      // Make request - starts at Presentation Layer (Route)
      const response = await request(app).get('/api/projects/1a7501a0')

      // Verify response from full DDD flow
      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data).toBeDefined()
      expect(response.body.data.project).toBeDefined()
      expect(response.body.data.project.path).toBe(mockProjectPath)
      expect(response.body.data.integrations).toBeDefined()

      delete process.env.AVAILABLE_REPOSITORIES
    })

    it('should properly validate through Domain Layer (Value Objects)', async () => {
      // Invalid project ID should be rejected at Route level using ProjectId.isValid()
      const response = await request(app).get('/api/projects/invalid-id')

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.error).toBe('Invalid project ID format')
    })

    it('should handle not found through full stack', async () => {
      process.env.AVAILABLE_REPOSITORIES = JSON.stringify([])

      const response = await request(app).get('/api/projects/99999999')

      expect(response.status).toBe(404)
      expect(response.body.success).toBe(false)

      delete process.env.AVAILABLE_REPOSITORIES
    })
  })

  describe('IDE Session Flow', () => {
    it('should open IDE through full DDD flow', async () => {
      const mockProjectPath = '/Users/test/test-project'

      process.env.AVAILABLE_REPOSITORIES = JSON.stringify([
        { path: mockProjectPath, id: '1a7501a0' }
      ])

      existsSync.mockReturnValue(true)

      // Mock which command to return vscode path
      jest.unstable_mockModule('child_process', () => ({
        execSync: jest.fn().mockReturnValue('/usr/local/bin/code\n')
      }))

      const response = await request(app)
        .post('/api/projects/1a7501a0/ide-sessions')
        .send({ ide: 'vscode' })

      // Should flow through:
      // 1. Route validates project ID
      // 2. Route finds project path using controller helper
      // 3. Controller calls openInIDE
      // 4. Service handles IDE opening
      expect(response.status).toBe(200)

      delete process.env.AVAILABLE_REPOSITORIES
    })
  })

  describe('Git Operations Flow', () => {
    it('should get branches through full stack', async () => {
      const mockProjectPath = '/Users/test/test-project'

      process.env.AVAILABLE_REPOSITORIES = JSON.stringify([
        { path: mockProjectPath, id: '1a7501a0' }
      ])

      existsSync.mockReturnValue(true)

      // Mock git operations
      jest.unstable_mockModule('simple-git', () => ({
        default: jest.fn(() => ({
          branch: jest.fn().mockResolvedValue({
            current: 'main',
            all: ['main', 'develop', 'feature/test']
          })
        }))
      }))

      const response = await request(app).get('/api/projects/1a7501a0/git/branches')

      expect(response.status).toBe(200)

      delete process.env.AVAILABLE_REPOSITORIES
    })
  })

  describe('Error Propagation Through Layers', () => {
    it('should propagate repository errors through use case to controller', async () => {
      process.env.AVAILABLE_REPOSITORIES = JSON.stringify([
        { path: '/test/path', id: '1a7501a0' }
      ])

      // Mock repository failure
      existsSync.mockReturnValue(true)
      fsExtra.readJson.mockRejectedValue(new Error('Permission denied'))

      const response = await request(app).get('/api/projects/1a7501a0')

      // Error should propagate up and be handled
      expect(response.status).toBe(500)
      expect(response.body.success).toBe(false)

      delete process.env.AVAILABLE_REPOSITORIES
    })

    it('should handle validation errors at presentation layer', async () => {
      // Port validation should happen at Controller/Route level
      const response = await request(app)
        .post('/api/projects/1a7501a0/frigg/executions')
        .send({ port: 99999 })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
    })
  })

  describe('Dependency Injection Verification', () => {
    it('should wire dependencies correctly through container', () => {
      // Verify container has wired dependencies
      expect(container.projectController).toBeDefined()
      expect(container.projectRepository).toBeDefined()
      expect(container.integrationRepository).toBeDefined()
      expect(container.inspectProjectUseCase).toBeDefined()

      // Verify use case has repository dependencies
      expect(container.inspectProjectUseCase.projectRepository).toBe(container.projectRepository)
      expect(container.inspectProjectUseCase.integrationRepository).toBe(container.integrationRepository)
    })

    it('should not allow direct repository access from routes', async () => {
      // Routes should only access controllers, never repositories directly
      // This is enforced by architecture - routes don't have repository imports

      const response = await request(app).get('/api/projects')

      // Should work through controller
      expect(response.status).toBe(200)
    })
  })

  describe('Business Logic Separation', () => {
    it('should keep HTTP concerns in presentation layer', async () => {
      process.env.AVAILABLE_REPOSITORIES = JSON.stringify([])

      const response = await request(app).get('/api/projects/99999999')

      // HTTP status code (404) is presentation concern
      expect(response.status).toBe(404)
      // Error message is domain concern
      expect(response.body.error).toMatch(/not found/i)

      delete process.env.AVAILABLE_REPOSITORIES
    })

    it('should keep business logic in use case layer', async () => {
      const mockProjectPath = '/Users/test/test-project'

      process.env.AVAILABLE_REPOSITORIES = JSON.stringify([
        { path: mockProjectPath, id: '1a7501a0' }
      ])

      existsSync.mockReturnValue(true)
      fsExtra.readJson.mockResolvedValue({
        name: 'test-project',
        version: '1.0.0'
      })

      readdirSync.mockReturnValue([
        { name: 'integration1', isDirectory: () => true },
        { name: 'integration2', isDirectory: () => true },
        { name: 'integration3', isDirectory: () => true }
      ])

      const response = await request(app).get('/api/projects/1a7501a0')

      // Business logic (counting integrations) happens in use case
      // Presentation layer just returns the result
      expect(response.body.data.summary).toBeDefined()
      expect(response.body.data.summary.totalIntegrations).toBe(3)

      delete process.env.AVAILABLE_REPOSITORIES
    })
  })
})
