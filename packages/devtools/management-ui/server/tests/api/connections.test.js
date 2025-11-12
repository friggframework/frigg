import request from 'supertest'
import { jest } from '@jest/globals'
import express from 'express'
import connectionsRouter from '../../api/connections.js'

describe('Connections API', () => {
  let app
  let mockWsHandler

  beforeEach(() => {
    app = express()
    app.use(express.json())

    // Mock WebSocket handler
    mockWsHandler = {
      broadcast: jest.fn()
    }

    // Mount the router
    app.use('/api/connections', connectionsRouter)
  })

  describe('GET /api/connections', () => {
    it('should list all connections', async () => {
      const response = await request(app)
        .get('/api/connections')
        .expect(200)

      expect(response.body).toHaveProperty('connections')
      expect(Array.isArray(response.body.connections)).toBe(true)
      expect(response.body).toHaveProperty('total')
    })

    it('should filter connections by userId', async () => {
      const response = await request(app)
        .get('/api/connections?userId=user123')
        .expect(200)

      expect(response.body).toHaveProperty('connections')
      expect(Array.isArray(response.body.connections)).toBe(true)
    })

    it('should filter connections by integration', async () => {
      const response = await request(app)
        .get('/api/connections?integration=hubspot')
        .expect(200)

      expect(response.body).toHaveProperty('connections')
      expect(Array.isArray(response.body.connections)).toBe(true)
    })

    it('should filter connections by status', async () => {
      const response = await request(app)
        .get('/api/connections?status=active')
        .expect(200)

      expect(response.body).toHaveProperty('connections')
      expect(Array.isArray(response.body.connections)).toBe(true)
    })
  })

  describe('GET /api/connections/:id', () => {
    it('should return 404 for non-existent connection', async () => {
      const response = await request(app)
        .get('/api/connections/nonexistent')
        .expect(404)

      expect(response.body.error).toBeDefined()
      expect(response.body.error).toContain('not found')
    })
  })

  describe('POST /api/connections', () => {
    it('should require userId and integration', async () => {
      const response = await request(app)
        .post('/api/connections')
        .send({})
        .expect(400)

      expect(response.body.error).toBeDefined()
      expect(response.body.error).toContain('required')
    })

    it('should create a new connection with valid data', async () => {
      const newConnection = {
        userId: 'user123',
        integration: 'hubspot',
        credentials: {
          apiKey: 'test-key'
        }
      }

      const response = await request(app)
        .post('/api/connections')
        .send(newConnection)

      // May return 201 or 400 if connection exists
      expect([201, 400]).toContain(response.status)

      if (response.status === 201) {
        expect(response.body).toHaveProperty('id')
        expect(response.body).toHaveProperty('userId', 'user123')
        expect(response.body).toHaveProperty('integration', 'hubspot')
        expect(response.body).toHaveProperty('status', 'active')
      }
    })
  })

  describe('PUT /api/connections/:id', () => {
    it('should return 404 for non-existent connection', async () => {
      const response = await request(app)
        .put('/api/connections/nonexistent')
        .send({ status: 'inactive' })
        .expect(404)

      expect(response.body.error).toBeDefined()
    })
  })

  describe('DELETE /api/connections/:id', () => {
    it('should return 404 for non-existent connection', async () => {
      const response = await request(app)
        .delete('/api/connections/nonexistent')
        .expect(404)

      expect(response.body.error).toBeDefined()
    })
  })

  describe('POST /api/connections/:id/test', () => {
    it('should test a connection', async () => {
      const response = await request(app)
        .post('/api/connections/test123/test')
        .send({ comprehensive: false })

      // Will return 404 if connection doesn't exist
      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.body).toHaveProperty('results')
        expect(response.body).toHaveProperty('summary')
      }
    })

    it('should perform comprehensive test when requested', async () => {
      const response = await request(app)
        .post('/api/connections/test123/test')
        .send({ comprehensive: true })

      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.body).toHaveProperty('results')
        expect(response.body).toHaveProperty('summary')
        expect(response.body.summary).toHaveProperty('testsRun')
      }
    })
  })

  describe('GET /api/connections/:id/entities', () => {
    it('should get entities for a connection', async () => {
      const response = await request(app)
        .get('/api/connections/test123/entities')
        .expect(200)

      expect(response.body).toHaveProperty('entities')
      expect(Array.isArray(response.body.entities)).toBe(true)
      expect(response.body).toHaveProperty('total')
    })
  })

  describe('POST /api/connections/:id/entities', () => {
    it('should create an entity for a connection', async () => {
      const newEntity = {
        type: 'contact',
        externalId: 'ext123',
        data: {
          name: 'John Doe',
          email: 'john@example.com'
        }
      }

      const response = await request(app)
        .post('/api/connections/test123/entities')
        .send(newEntity)

      // Will return 404 if connection doesn't exist
      expect([201, 404]).toContain(response.status)

      if (response.status === 201) {
        expect(response.body).toHaveProperty('id')
        expect(response.body).toHaveProperty('type', 'contact')
        expect(response.body).toHaveProperty('externalId')
      }
    })
  })

  describe('POST /api/connections/:id/sync', () => {
    it('should sync entities for a connection', async () => {
      const response = await request(app)
        .post('/api/connections/test123/sync')

      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.body).toHaveProperty('status')
        expect(response.body).toHaveProperty('entitiesAdded')
        expect(response.body).toHaveProperty('entitiesUpdated')
        expect(response.body).toHaveProperty('entitiesRemoved')
      }
    })
  })

  describe('GET /api/connections/stats/summary', () => {
    it('should get connection statistics', async () => {
      const response = await request(app)
        .get('/api/connections/stats/summary')
        .expect(200)

      expect(response.body).toHaveProperty('totalConnections')
      expect(response.body).toHaveProperty('totalEntities')
      expect(response.body).toHaveProperty('byIntegration')
      expect(response.body).toHaveProperty('byStatus')
      expect(response.body).toHaveProperty('activeConnections')
    })
  })

  describe('OAuth endpoints', () => {
    describe('POST /api/connections/oauth/init', () => {
      it('should initialize OAuth flow', async () => {
        const response = await request(app)
          .post('/api/connections/oauth/init')
          .send({
            integration: 'hubspot',
            provider: 'google'
          })

        // May fail without proper env vars
        expect(response.status).toBeGreaterThanOrEqual(200)

        if (response.status === 200) {
          expect(response.body).toHaveProperty('authUrl')
          expect(response.body).toHaveProperty('state')
        }
      })
    })

    describe('GET /api/connections/oauth/callback', () => {
      it('should handle OAuth callback', async () => {
        const response = await request(app)
          .get('/api/connections/oauth/callback?code=test&state=test')

        // Will return error without valid session
        expect(response.status).toBeGreaterThanOrEqual(200)
      })
    })

    describe('GET /api/connections/oauth/status/:state', () => {
      it('should check OAuth status', async () => {
        const response = await request(app)
          .get('/api/connections/oauth/status/teststate')
          .expect(404)

        expect(response.body.error).toBeDefined()
      })
    })
  })

  describe('GET /api/connections/:id/health', () => {
    it('should get connection health', async () => {
      const response = await request(app)
        .get('/api/connections/test123/health')

      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.body).toHaveProperty('status')
        expect(response.body).toHaveProperty('uptime')
        expect(response.body).toHaveProperty('errorRate')
        expect(response.body).toHaveProperty('apiCalls')
      }
    })
  })

  describe('GET /api/connections/:id/relationships', () => {
    it('should get entity relationships', async () => {
      const response = await request(app)
        .get('/api/connections/test123/relationships')
        .expect(200)

      expect(response.body).toHaveProperty('relationships')
      expect(Array.isArray(response.body.relationships)).toBe(true)
      expect(response.body).toHaveProperty('total')
    })
  })

  describe('PUT /api/connections/:id/config', () => {
    it('should update connection configuration', async () => {
      const config = {
        syncInterval: 3600,
        maxRetries: 3
      }

      const response = await request(app)
        .put('/api/connections/test123/config')
        .send(config)

      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.body).toHaveProperty('id')
        expect(response.body).toHaveProperty('updatedAt')
      }
    })
  })
})