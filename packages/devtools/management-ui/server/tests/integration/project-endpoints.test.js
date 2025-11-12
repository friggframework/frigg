/**
 * Integration tests for Project API endpoints
 * Tests the complete API contract as specified in API_STRUCTURE.md
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { createContainer } from '../../src/container.js'

describe('Project API Endpoints', () => {
  let app
  let container
  let testProjectId
  let testProjectPath

  beforeAll(async () => {
    // Set up test environment
    process.env.AVAILABLE_REPOSITORIES = JSON.stringify([
      {
        path: process.cwd(),
        name: 'test-project',
        hasFriggConfig: true,
        gitBranch: 'main'
      }
    ])

    container = createContainer()
    app = createApp(container)

    // Generate test project ID
    const { ProjectId } = await import('../../src/domain/value-objects/ProjectId.js')
    testProjectPath = process.cwd()
    testProjectId = ProjectId.generate(testProjectPath)
  })

  afterAll(async () => {
    // Clean up
    delete process.env.AVAILABLE_REPOSITORIES
  })

  describe('GET /api/projects', () => {
    it('should list all projects with deterministic IDs', async () => {
      const response = await request(app)
        .get('/api/projects')
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveProperty('repositories')
      expect(Array.isArray(response.body.data.repositories)).toBe(true)

      if (response.body.data.repositories.length > 0) {
        const project = response.body.data.repositories[0]
        expect(project).toHaveProperty('id')
        expect(project).toHaveProperty('name')
        expect(project).toHaveProperty('path')
        expect(project.id).toMatch(/^[a-f0-9]{8}$/)
      }
    })
  })

  describe('GET /api/projects/:id', () => {
    it('should return complete project details matching API spec', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      const data = response.body.data

      // Validate response structure matches API spec
      expect(data).toHaveProperty('id', testProjectId)
      expect(data).toHaveProperty('name')
      expect(data).toHaveProperty('path', testProjectPath)

      // App definition (camelCase) with nested integrations
      expect(data).toHaveProperty('appDefinition')
      expect(data.appDefinition).toBeInstanceOf(Object)
      // Integrations should be inside appDefinition
      if (data.appDefinition.integrations) {
        expect(Array.isArray(data.appDefinition.integrations)).toBe(true)
      }

      // API modules array
      expect(data).toHaveProperty('apiModules')
      expect(Array.isArray(data.apiModules)).toBe(true)

      // Git status object (camelCase)
      expect(data).toHaveProperty('git')
      expect(data.git).toHaveProperty('currentBranch')
      expect(data.git).toHaveProperty('status')
      expect(data.git.status).toHaveProperty('staged')
      expect(data.git.status).toHaveProperty('unstaged')
      expect(data.git.status).toHaveProperty('untracked')
      expect(typeof data.git.status.staged).toBe('number')
      expect(typeof data.git.status.unstaged).toBe('number')
      expect(typeof data.git.status.untracked).toBe('number')

      // Frigg status object (camelCase)
      expect(data).toHaveProperty('friggStatus')
      expect(data.friggStatus).toHaveProperty('running')
      expect(typeof data.friggStatus.running).toBe('boolean')
      expect(data.friggStatus).toHaveProperty('executionId')
      expect(data.friggStatus).toHaveProperty('port')
    })

    it('should return 404 for non-existent project', async () => {
      const response = await request(app)
        .get('/api/projects/deadbeef')
        .expect(404)

      expect(response.body.success).toBe(false)
      expect(response.body.error).toContain('not found')
    })

    it('should return 400 for invalid project ID format', async () => {
      const response = await request(app)
        .get('/api/projects/invalid-id-format')
        .expect(400)

      expect(response.body.success).toBe(false)
      expect(response.body.error).toContain('Invalid project ID')
    })
  })

  describe('POST /api/projects/:id/frigg/executions', () => {
    it('should validate request body and return proper error for invalid data', async () => {
      // Test with invalid env parameter (object instead of plain key-value pairs)
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/frigg/executions`)
        .send({
          port: 3000,
          env: {
            NODE_ENV: { value: 'development' } // Wrong: should be string, not object
          }
        })
        .expect(400)

      expect(response.body.success).toBe(false)
      expect(response.body.error).toMatch(/env.*string|validation/i)
    })

    it('should accept valid request body', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/frigg/executions`)
        .send({
          port: 3000,
          env: {
            NODE_ENV: 'development',
            DEBUG: 'true'
          }
        })

      // May fail to actually start, but should pass validation
      // Accept both 200 (started) or 500 (failed to start due to process issues)
      expect([200, 500]).toContain(response.status)

      if (response.status === 200) {
        expect(response.body.success).toBe(true)
        expect(response.body.data).toHaveProperty('executionId')
        expect(response.body.data).toHaveProperty('pid')
        expect(response.body.data).toHaveProperty('port')
        expect(response.body.data).toHaveProperty('friggBaseUrl')
        expect(response.body.data).toHaveProperty('websocketUrl')
        expect(response.body.data.friggBaseUrl).toMatch(/^http:\/\/localhost:\d+$/)
      }
    })
  })

  describe('GET /api/projects/:id/git/status', () => {
    it('should return git status matching API spec', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/git/status`)
        .expect(200)

      expect(response.body.success).toBe(true)
      const data = response.body.data

      expect(data).toHaveProperty('branch')
      expect(typeof data.branch).toBe('string')

      expect(data).toHaveProperty('staged')
      expect(Array.isArray(data.staged)).toBe(true)

      expect(data).toHaveProperty('unstaged')
      expect(Array.isArray(data.unstaged)).toBe(true)

      expect(data).toHaveProperty('untracked')
      expect(Array.isArray(data.untracked)).toBe(true)

      expect(data).toHaveProperty('clean')
      expect(typeof data.clean).toBe('boolean')
    })
  })

  describe('GET /api/projects/:id/git/branches', () => {
    it('should return branch list matching API spec', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/git/branches`)
        .expect(200)

      expect(response.body.success).toBe(true)
      const data = response.body.data

      expect(data).toHaveProperty('current')
      expect(typeof data.current).toBe('string')

      expect(data).toHaveProperty('branches')
      expect(Array.isArray(data.branches)).toBe(true)

      if (data.branches.length > 0) {
        const branch = data.branches[0]
        expect(branch).toHaveProperty('name')
        expect(branch).toHaveProperty('type')
        expect(['local', 'remote']).toContain(branch.type)
      }
    })
  })
})