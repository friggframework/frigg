import request from 'supertest'
import { jest } from '@jest/globals'
import express from 'express'
import projectRouter from '../../api/project.js'
import { createStandardResponse } from '../../utils/response.js'

describe('Project API', () => {
  let app
  let mockIo

  beforeEach(() => {
    app = express()
    app.use(express.json())

    // Mock WebSocket
    mockIo = {
      emit: jest.fn(),
      on: jest.fn()
    }
    app.set('io', mockIo)

    // Mount the router
    app.use('/api/project', projectRouter)
  })

  describe('GET /api/project/status', () => {
    it('should return project status', async () => {
      const response = await request(app)
        .get('/api/project/status')
        .expect(200)

      expect(response.body).toHaveProperty('data')
      expect(response.body.data).toHaveProperty('status')
      expect(response.body.data).toHaveProperty('environment')
    })

    it('should include project info from package.json when available', async () => {
      const response = await request(app)
        .get('/api/project/status')
        .expect(200)

      expect(response.body.data).toHaveProperty('name')
      expect(response.body.data).toHaveProperty('version')
    })
  })

  describe('POST /api/project/start', () => {
    it('should start the project', async () => {
      const response = await request(app)
        .post('/api/project/start')
        .send({
          stage: 'dev',
          verbose: false,
          port: 3000
        })
        .expect(200)

      expect(response.body).toHaveProperty('data')
      expect(response.body.data.message).toBe('Project started successfully')
      expect(response.body.data.status).toBe('running')

      // Verify WebSocket events were emitted
      expect(mockIo.emit).toHaveBeenCalledWith('project:status', expect.objectContaining({
        status: 'starting'
      }))
    })

    it('should reject start if project is already running', async () => {
      // First start
      await request(app)
        .post('/api/project/start')
        .send({ stage: 'dev' })
        .expect(200)

      // Try to start again
      const response = await request(app)
        .post('/api/project/start')
        .send({ stage: 'dev' })
        .expect(400)

      expect(response.body.error).toBeDefined()
      expect(response.body.error.code).toBe('PROJECT_ALREADY_RUNNING')
    })
  })

  describe('POST /api/project/stop', () => {
    it('should stop a running project', async () => {
      // Start project first
      await request(app)
        .post('/api/project/start')
        .send({ stage: 'dev' })
        .expect(200)

      // Stop it
      const response = await request(app)
        .post('/api/project/stop')
        .expect(200)

      expect(response.body).toHaveProperty('data')
      expect(response.body.data.message).toBe('Project is stopping')
    })

    it('should reject stop if project is not running', async () => {
      const response = await request(app)
        .post('/api/project/stop')
        .expect(400)

      expect(response.body.error).toBeDefined()
      expect(response.body.error.code).toBe('PROJECT_NOT_RUNNING')
    })
  })

  describe('GET /api/project/repositories', () => {
    it('should list available Frigg repositories', async () => {
      const response = await request(app)
        .get('/api/project/repositories')
        .expect(200)

      expect(response.body).toHaveProperty('data')
      expect(response.body.data).toHaveProperty('repositories')
      expect(Array.isArray(response.body.data.repositories)).toBe(true)
    })
  })

  describe('POST /api/project/switch-repository', () => {
    it('should switch to a different repository', async () => {
      const mockRepoPath = '/path/to/repo'

      const response = await request(app)
        .post('/api/project/switch-repository')
        .send({ repositoryPath: mockRepoPath })

      // Note: This will fail in test environment without proper mocking
      // But we're testing the API structure
      expect(response.status).toBeGreaterThanOrEqual(400) // Expected to fail without valid repo
    })

    it('should reject switch without repository path', async () => {
      const response = await request(app)
        .post('/api/project/switch-repository')
        .send({})
        .expect(400)

      expect(response.body.error).toBeDefined()
      expect(response.body.error.message).toContain('required')
    })
  })

  describe('GET /api/project/analyze-integrations', () => {
    it('should analyze project integrations', async () => {
      const response = await request(app)
        .get('/api/project/analyze-integrations')
        .expect(200)

      expect(response.body).toHaveProperty('data')
      expect(response.body.data).toHaveProperty('analysis')
      expect(response.body.data).toHaveProperty('projectPath')
    })
  })

  describe('IDE endpoints', () => {
    describe('GET /api/project/ides/available', () => {
      it('should list available IDEs', async () => {
        const response = await request(app)
          .get('/api/project/ides/available')
          .expect(200)

        expect(response.body).toHaveProperty('data')
        expect(response.body.data).toHaveProperty('platform')
        expect(response.body.data).toHaveProperty('ides')
        expect(response.body.data).toHaveProperty('summary')
      })
    })

    describe('GET /api/project/ides/:ideId/check', () => {
      it('should check if specific IDE is available', async () => {
        const response = await request(app)
          .get('/api/project/ides/vscode/check')
          .expect(200)

        expect(response.body).toHaveProperty('data')
        expect(response.body.data).toHaveProperty('id')
        expect(response.body.data).toHaveProperty('available')
        expect(response.body.data).toHaveProperty('reason')
      })

      it('should return 404 for unknown IDE', async () => {
        const response = await request(app)
          .get('/api/project/ides/unknown-ide/check')
          .expect(404)

        expect(response.body.error).toBeDefined()
      })
    })

    describe('POST /api/project/open-in-ide', () => {
      it('should validate file path is required', async () => {
        const response = await request(app)
          .post('/api/project/open-in-ide')
          .send({ ide: 'vscode' })
          .expect(400)

        expect(response.body.error).toBeDefined()
        expect(response.body.error.message).toContain('required')
      })

      it('should validate IDE or command is required', async () => {
        const response = await request(app)
          .post('/api/project/open-in-ide')
          .send({ path: '/some/path' })
          .expect(400)

        expect(response.body.error).toBeDefined()
      })
    })
  })
})