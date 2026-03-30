import express from 'express'
import { StartProjectUseCase } from '../../application/use-cases/StartProjectUseCase.js'
import { StopProjectUseCase } from '../../application/use-cases/StopProjectUseCase.js'

/**
 * WebSocket service wrapper for ProcessManager
 */
class WebSocketService {
  constructor(io) {
    this.io = io
  }

  emit(event, data) {
    this.io.emit(event, data)
  }
}

/**
 * Test Area API routes
 * Manages Frigg service lifecycle for test area
 */
export function createTestAreaRoutes(container) {
  const router = express.Router()

  // Get WebSocket instance from app
  const getWebSocketService = (req) => {
    const io = req.app.get('io')
    return new WebSocketService(io)
  }

  // Get project status (is Frigg running?)
  router.get('/status', async (req, res, next) => {
    try {
      const processManager = container.getTestAreaProcessManager()
      let status = processManager.getStatus()

      // If no process is being managed, check for existing Frigg processes
      if (!status.isRunning) {
        const existing = await processManager.detectExistingProcess()
        if (existing && existing.detected) {
          status = {
            isRunning: true,
            status: 'running',
            port: existing.port,
            baseUrl: `http://localhost:${existing.port}`,
            detectedExisting: true,
            message: 'Detected existing Frigg process (not managed by UI)'
          }
        }
      }

      res.json({
        success: true,
        data: status
      })
    } catch (error) {
      next(error)
    }
  })

  // Start Frigg project
  router.post('/start', async (req, res, next) => {
    try {
      const { repositoryPath } = req.body

      if (!repositoryPath) {
        return res.status(400).json({
          success: false,
          error: 'Repository path is required'
        })
      }

      const processManager = container.getTestAreaProcessManager()
      const webSocketService = getWebSocketService(req)

      const startUseCase = new StartProjectUseCase({
        processManager,
        webSocketService
      })

      const result = await startUseCase.execute(repositoryPath)

      res.json({
        success: true,
        data: result
      })
    } catch (error) {
      next(error)
    }
  })

  // Stop Frigg project
  router.post('/stop', async (req, res, next) => {
    try {
      const { force = false, timeout = 5000 } = req.body

      const processManager = container.getTestAreaProcessManager()
      const webSocketService = getWebSocketService(req)

      const stopUseCase = new StopProjectUseCase({
        processManager,
        webSocketService
      })

      const result = await stopUseCase.execute({ force, timeout })

      res.json({
        success: true,
        data: result
      })
    } catch (error) {
      next(error)
    }
  })

  // Health check endpoint
  router.get('/health', async (req, res, next) => {
    try {
      const processManager = container.getTestAreaProcessManager()
      const isRunning = processManager.isRunning()
      const status = processManager.getStatus()

      res.json({
        success: true,
        data: {
          isRunning,
          healthy: isRunning && status.port > 0,
          uptime: status.uptime,
          lastCheck: new Date().toISOString()
        }
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}