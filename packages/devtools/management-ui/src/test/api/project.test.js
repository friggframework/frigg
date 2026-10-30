import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  exec: vi.fn()
}))

// Mock fs/promises  
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  stat: vi.fn(),
  access: vi.fn()
}))

// Mock the utilities
vi.mock('../../server/utils/response.js', () => ({
  createStandardResponse: (data) => ({ success: true, data }),
  createErrorResponse: (code, message) => ({ success: false, error: { code, message } }),
  ERROR_CODES: {
    PROJECT_ALREADY_RUNNING: 'PROJECT_ALREADY_RUNNING',
    PROJECT_NOT_RUNNING: 'PROJECT_NOT_RUNNING',
    PROJECT_START_FAILED: 'PROJECT_START_FAILED',
    PROJECT_STOP_FAILED: 'PROJECT_STOP_FAILED',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INTERNAL_ERROR: 'INTERNAL_ERROR'
  },
  asyncHandler: (fn) => fn
}))

describe('Project API - Repository Discovery', () => {
  let app
  let projectRouter

  beforeEach(async () => {
    vi.clearAllMocks()
    
    // Create fresh Express app for each test
    app = express()
    app.use(express.json())
    
    // Import the router after mocks are set up
    const module = await import('../../server/api/project.js')
    projectRouter = module.default
    app.use('/api/project', projectRouter)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // Clean up environment variables
    delete process.env.AVAILABLE_REPOSITORIES
    delete process.env.REPOSITORY_INFO
  })

  describe('GET /api/project/repositories', () => {
    it('should return repositories from environment variable when available', async () => {
      const mockRepos = [
        {
          name: 'test-app-1',
          path: '/path/to/app1',
          framework: 'React',
          version: '1.0.0'
        },
        {
          name: 'test-app-2',
          path: '/path/to/app2',
          framework: 'Vue', 
          version: '2.0.0'
        }
      ]

      const mockCurrentRepo = {
        name: 'Multiple Repositories Available',
        isMultiRepo: true,
        availableRepos: mockRepos
      }

      // Set environment variables to simulate CLI discovery
      process.env.AVAILABLE_REPOSITORIES = JSON.stringify(mockRepos)
      process.env.REPOSITORY_INFO = JSON.stringify(mockCurrentRepo)

      const response = await request(app)
        .get('/api/project/repositories')
        .expect(200)

      expect(response.body).toEqual({
        success: true,
        data: {
          repositories: mockRepos,
          currentRepository: mockCurrentRepo,
          isMultiRepo: true
        }
      })
    })

    it('should fall back to CLI discovery when no environment variable', async () => {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      
      const mockRepos = [
        {
          name: 'discovered-app',
          path: '/discovered/path',
          framework: 'Angular'
        }
      ]

      // Mock execAsync to return discovered repositories
      const execAsync = vi.fn().mockResolvedValue({
        stdout: JSON.stringify(mockRepos),
        stderr: ''
      })
      
      vi.mocked(promisify).mockReturnValue(execAsync)

      const response = await request(app)
        .get('/api/project/repositories')
        .expect(200)

      expect(response.body.data.repositories).toEqual(mockRepos)
      expect(response.body.data.isMultiRepo).toBe(false)
    })

    it('should handle CLI discovery errors gracefully', async () => {
      const { promisify } = await import('util')
      
      // Mock execAsync to throw error
      const execAsync = vi.fn().mockRejectedValue(new Error('CLI discovery failed'))
      vi.mocked(promisify).mockReturnValue(execAsync)

      const response = await request(app)
        .get('/api/project/repositories')
        .expect(200)

      expect(response.body).toEqual({
        success: true,
        data: {
          repositories: [],
          currentRepository: null,
          isMultiRepo: false,
          error: 'Failed to discover repositories: CLI discovery failed'
        }
      })
    })

    it('should handle malformed environment variable gracefully', async () => {
      // Set malformed JSON in environment variable
      process.env.AVAILABLE_REPOSITORIES = 'invalid-json'
      
      const { promisify } = await import('util')
      const execAsync = vi.fn().mockResolvedValue({
        stdout: '[]',
        stderr: ''
      })
      vi.mocked(promisify).mockReturnValue(execAsync)

      const response = await request(app)
        .get('/api/project/repositories')
        .expect(200)

      // Should fall back to CLI discovery
      expect(response.body.data.repositories).toEqual([])
    })

    it('should include current repository information', async () => {
      const mockCurrentRepo = {
        name: 'current-app',
        path: '/current/path',
        version: '1.5.0',
        isMultiRepo: false
      }

      process.env.REPOSITORY_INFO = JSON.stringify(mockCurrentRepo)
      process.env.AVAILABLE_REPOSITORIES = JSON.stringify([])

      const response = await request(app)
        .get('/api/project/repositories')
        .expect(200)

      expect(response.body.data.currentRepository).toEqual(mockCurrentRepo)
      expect(response.body.data.isMultiRepo).toBe(false)
    })

    it('should detect multi-repo scenario correctly', async () => {
      const mockRepos = [
        { name: 'app1', path: '/path1' },
        { name: 'app2', path: '/path2' },
        { name: 'app3', path: '/path3' }
      ]

      const mockCurrentRepo = {
        name: 'Multiple Repositories Available', 
        isMultiRepo: true,
        availableRepos: mockRepos
      }

      process.env.AVAILABLE_REPOSITORIES = JSON.stringify(mockRepos)
      process.env.REPOSITORY_INFO = JSON.stringify(mockCurrentRepo)

      const response = await request(app)
        .get('/api/project/repositories')
        .expect(200)

      expect(response.body.data.isMultiRepo).toBe(true)
      expect(response.body.data.repositories).toHaveLength(3)
      expect(response.body.data.currentRepository.isMultiRepo).toBe(true)
    })
  })

  describe('POST /api/project/switch-repository', () => {
    it('should switch repository successfully', async () => {
      const fs = await import('fs/promises')
      
      // Mock file system operations
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true })
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        name: 'switched-app',
        version: '2.0.0'
      }))

      // Mock WebSocket
      const mockIo = {
        emit: vi.fn()
      }
      app.set('io', mockIo)

      const response = await request(app)
        .post('/api/project/switch-repository')
        .send({ repositoryPath: '/path/to/new/repo' })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.repository.name).toBe('switched-app')
      expect(response.body.data.repository.path).toBe('/path/to/new/repo')
      
      // Should emit WebSocket event
      expect(mockIo.emit).toHaveBeenCalledWith('repository:switched', {
        repository: {
          name: 'switched-app',
          path: '/path/to/new/repo',
          version: '2.0.0'
        }
      })
    })

    it('should reject invalid repository path', async () => {
      const response = await request(app)
        .post('/api/project/switch-repository')
        .send({}) // Missing repositoryPath
        .expect(400)

      expect(response.body.success).toBe(false)
      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('should handle non-existent repository path', async () => {
      const fs = await import('fs/promises')
      
      // Mock file system to throw error
      vi.mocked(fs.stat).mockRejectedValue(new Error('Path not found'))

      const response = await request(app)
        .post('/api/project/switch-repository')
        .send({ repositoryPath: '/invalid/path' })
        .expect(500)

      expect(response.body.success).toBe(false)
      expect(response.body.error.code).toBe('INTERNAL_ERROR')
    })
  })
})