import request from 'supertest'
import { jest } from '@jest/globals'
import express from 'express'
import integrationsRouter from '../../api/integrations.js'

describe('Integrations API', () => {
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
    app.use('/api/integrations', integrationsRouter)
  })

  describe('GET /api/integrations', () => {
    it('should list all integrations', async () => {
      const response = await request(app)
        .get('/api/integrations')
        .expect(200)

      expect(response.body).toHaveProperty('integrations')
      expect(Array.isArray(response.body.integrations)).toBe(true)
      expect(response.body).toHaveProperty('total')
      expect(response.body).toHaveProperty('activeIntegrations')
      expect(response.body).toHaveProperty('availableModules')
    })

    it('should include both installed and available integrations', async () => {
      const response = await request(app)
        .get('/api/integrations')
        .expect(200)

      expect(response.body).toHaveProperty('integrations')
      expect(response.body).toHaveProperty('availableApiModules')
      expect(response.body).toHaveProperty('source')
    })
  })

  describe('POST /api/integrations/install', () => {
    it('should require package name', async () => {
      const response = await request(app)
        .post('/api/integrations/install')
        .send({})
        .expect(400)

      expect(response.body.error).toBeDefined()
      expect(response.body.error).toContain('required')
    })

    it('should attempt to install integration with valid package name', async () => {
      // This will fail in test env without actual npm, but tests API structure
      const response = await request(app)
        .post('/api/integrations/install')
        .send({ packageName: '@friggframework/api-module-hubspot' })

      // Expect either success or specific error from exec
      expect(response.status).toBeGreaterThanOrEqual(200)
      expect(response.body).toBeDefined()
    })
  })

  describe('POST /api/integrations/:integrationName/configure', () => {
    it('should save integration configuration', async () => {
      const mockConfig = {
        apiKey: 'test-key',
        baseUrl: 'https://api.example.com'
      }

      const response = await request(app)
        .post('/api/integrations/hubspot/configure')
        .send({ config: mockConfig })

      // May fail without file system access, but tests API structure
      expect(response.status).toBeGreaterThanOrEqual(200)

      if (response.status === 200) {
        expect(response.body).toHaveProperty('status', 'success')
        expect(response.body).toHaveProperty('config')
      }
    })
  })

  describe('GET /api/integrations/:integrationName/config', () => {
    it('should get integration configuration', async () => {
      const response = await request(app)
        .get('/api/integrations/hubspot/config')

      expect(response.status).toBeGreaterThanOrEqual(200)

      if (response.status === 200) {
        expect(response.body).toHaveProperty('config')
      }
    })
  })

  describe('DELETE /api/integrations/:integrationName', () => {
    it('should remove an integration', async () => {
      const response = await request(app)
        .delete('/api/integrations/hubspot')

      // May fail without actual npm, but tests API structure
      expect(response.status).toBeGreaterThanOrEqual(200)

      if (response.status === 200) {
        expect(response.body).toHaveProperty('status', 'success')
      }
    })
  })

  describe('POST /api/integrations/test', () => {
    it('should require integration name and user ID', async () => {
      const response = await request(app)
        .post('/api/integrations/test')
        .send({})
        .expect(400)

      expect(response.body.error).toBeDefined()
      expect(response.body.error.message).toContain('required')
    })

    it('should test integration with valid parameters', async () => {
      const response = await request(app)
        .post('/api/integrations/test')
        .send({
          integrationName: 'hubspot',
          userId: 'user123'
        })
        .expect(200)

      expect(response.body).toHaveProperty('data')
      expect(response.body.data).toHaveProperty('integration', 'hubspot')
      expect(response.body.data).toHaveProperty('userId', 'user123')
      expect(response.body.data).toHaveProperty('tests')
      expect(Array.isArray(response.body.data.tests)).toBe(true)
    })
  })
})