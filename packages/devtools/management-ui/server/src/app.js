import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { Container } from './container.js'
import { createProjectRoutes } from './presentation/routes/projectRoutes.js'
import { createGitRoutes } from './presentation/routes/gitRoutes.js'
import { createTestAreaRoutes } from './presentation/routes/testAreaRoutes.js'

/**
 * Creates and configures the Express application with DDD architecture
 */
export function createApp({ projectPath = process.cwd() } = {}) {
  const app = express()
  const httpServer = createServer(app)
  const io = new Server(httpServer, {
    cors: {
      origin: ["http://localhost:5173", "http://localhost:3000"],
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true
    }
  })

  const container = new Container({ projectPath, io })

  // Store io instance for WebSocket communication
  app.set('io', io)

  // Store project path for controllers
  app.locals.projectPath = projectPath

  // Middleware
  app.use(cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    credentials: true
  }))
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true }))

  // Setup WebSocket events
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id)

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id)
    })
  })

  // API Routes (Clean Architecture)
  // Projects - management of local Frigg projects
  app.use('/api/projects', createProjectRoutes(container.getProjectController()))

  // Git operations for project branches
  app.use('/api/git', createGitRoutes(container.getGitController()))

  // Test Area - start/stop Frigg for testing with @friggframework/ui
  app.use('/api/test-area', createTestAreaRoutes(container))

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      projectPath
    })
  })

  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error('Error:', err)

    const status = err.status || 500
    const message = err.message || 'Internal server error'

    res.status(status).json({
      success: false,
      error: message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    })
  })

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'Route not found'
    })
  })

  // Store container and httpServer for cleanup
  app.locals.container = container
  app.locals.httpServer = httpServer

  return { app, httpServer, io }
}

/**
 * Starts the server
 */
export async function startServer(port = 3210, projectPath = process.cwd()) {
  const { app, httpServer, io } = createApp({ projectPath })

  // Add error handling for port conflicts
  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️  Port ${port} is already in use. Server may already be running.`)
      console.log(`   If you need to restart, please stop the existing server first.`)
      process.exit(0) // Exit gracefully instead of crashing
    } else {
      console.error('Server error:', err)
      process.exit(1)
    }
  })

  httpServer.listen(port, () => {
    console.log(`🚀 Frigg Management UI server running on port ${port}`)
    console.log(`📁 Managing project at: ${projectPath}`)
    console.log(`📡 WebSocket server ready`)
    console.log(`🌳 Git branch management enabled`)
  })

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...')
    if (app.locals.container) {
      await app.locals.container.cleanup()
    }
    httpServer.close(() => {
      console.log('Server closed')
      process.exit(0)
    })
  })

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...')
    if (app.locals.container) {
      await app.locals.container.cleanup()
    }
    httpServer.close(() => {
      console.log('Server closed')
      process.exit(0)
    })
  })

  return httpServer
}