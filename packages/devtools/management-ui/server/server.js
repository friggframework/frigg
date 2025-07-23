import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'

// Import middleware and utilities
import { errorHandler } from './middleware/errorHandler.js'
import { createStandardResponse } from './utils/response.js'
import { setupWebSocket } from './websocket/handler.js'
import { addLogEntry, LOG_LEVELS } from './api/logs.js'

// Import API routes
import projectRouter from './api/project.js'
import integrationsRouter from './api/integrations.js'
import environmentRouter from './api/environment.js'
import usersRouter from './api/users.js'
import connectionsRouter from './api/connections.js'
import cliRouter from './api/cli.js'
import logsRouter from './api/logs.js'
<<<<<<< HEAD
import monitoringRouter from './api/monitoring.js'
import codegenRouter from './api/codegen.js'
import discoveryRouter from './api/discovery.js'
import openIdeHandler from './api/open-ide.js'
=======
<<<<<<< HEAD
<<<<<<< HEAD
import monitoringRouter from './api/monitoring.js'
import codegenRouter from './api/codegen.js'
import discoveryRouter from './api/discovery.js'
<<<<<<< HEAD
=======
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
import monitoringRouter from './api/monitoring.js'
import codegenRouter from './api/codegen.js'
import discoveryRouter from './api/discovery.js'
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
=======
import openIdeHandler from './api/open-ide.js'
>>>>>>> d6114470 (feat: add comprehensive DDD/Hexagonal architecture RFC series)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
})

// Store io instance in app for route access
app.set('io', io)

// Middleware
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:3000"],
  credentials: true
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString()
  console.log(`${timestamp} - ${req.method} ${req.path}`)
<<<<<<< HEAD

=======
<<<<<<< HEAD

=======
  
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
  // Log API requests
  addLogEntry(LOG_LEVELS.INFO, `${req.method} ${req.path}`, 'api', {
    method: req.method,
    path: req.path,
    query: req.query,
    userAgent: req.get('User-Agent')
  })
<<<<<<< HEAD

=======
<<<<<<< HEAD

=======
  
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
  next()
})

// Setup WebSocket handling
setupWebSocket(io)

// Health check endpoint
app.get('/health', (req, res) => {
  res.json(createStandardResponse({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  }))
})

<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
// Get initial repository info
app.get('/api/repository/current', (req, res) => {
  const repoInfo = process.env.REPOSITORY_INFO ?
    JSON.parse(process.env.REPOSITORY_INFO) :
<<<<<<< HEAD
=======
=======
// Get initial repository info
app.get('/api/repository/current', (req, res) => {
  const repoInfo = process.env.REPOSITORY_INFO ? 
    JSON.parse(process.env.REPOSITORY_INFO) : 
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
    null
  res.json(createStandardResponse({ repository: repoInfo }))
})

<<<<<<< HEAD
=======
<<<<<<< HEAD
=======
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
// API endpoints
app.use('/api/project', projectRouter)
app.use('/api/integrations', integrationsRouter)
app.use('/api/environment', environmentRouter)
app.use('/api/users', usersRouter)
app.use('/api/connections', connectionsRouter)
app.use('/api/cli', cliRouter)
app.use('/api/logs', logsRouter)
<<<<<<< HEAD
app.use('/api/monitoring', monitoringRouter)
app.use('/api/codegen', codegenRouter)
app.use('/api/discovery', discoveryRouter)
app.post('/api/open-in-ide', openIdeHandler)
=======
<<<<<<< HEAD
<<<<<<< HEAD
app.use('/api/monitoring', monitoringRouter)
app.use('/api/codegen', codegenRouter)
app.use('/api/discovery', discoveryRouter)
<<<<<<< HEAD
=======
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
app.use('/api/monitoring', monitoringRouter)
app.use('/api/codegen', codegenRouter)
app.use('/api/discovery', discoveryRouter)
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
=======
app.post('/api/open-in-ide', openIdeHandler)
>>>>>>> d6114470 (feat: add comprehensive DDD/Hexagonal architecture RFC series)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json(createStandardResponse({
    name: 'Frigg Management UI API',
    version: '1.0.0',
    description: 'REST API for Frigg CLI-GUI communication',
    endpoints: {
      project: '/api/project',
      integrations: '/api/integrations',
      environment: '/api/environment',
      users: '/api/users',
      connections: '/api/connections',
      cli: '/api/cli',
<<<<<<< HEAD
      logs: '/api/logs',
      monitoring: '/api/monitoring',
      codegen: '/api/codegen'
=======
<<<<<<< HEAD
<<<<<<< HEAD
      logs: '/api/logs',
      monitoring: '/api/monitoring',
      codegen: '/api/codegen'
=======
      logs: '/api/logs'
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
      logs: '/api/logs',
      monitoring: '/api/monitoring',
      codegen: '/api/codegen'
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
    },
    websocket: {
      url: 'ws://localhost:3001',
      events: [
        'project:status',
        'project:logs',
        'integrations:update',
        'environment:update',
        'cli:output',
        'cli:complete',
<<<<<<< HEAD
        'logs:new',
        'monitoring:metrics',
        'monitoring:error'
=======
<<<<<<< HEAD
<<<<<<< HEAD
        'logs:new',
        'monitoring:metrics',
        'monitoring:error'
=======
        'logs:new'
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
        'logs:new',
        'monitoring:metrics',
        'monitoring:error'
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
      ]
    },
    documentation: '/api-contract.md'
  }))
})

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')))
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'))
  })
}

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json(createStandardResponse(null, `API endpoint not found: ${req.path}`))
})

// Error handling middleware (must be last)
app.use(errorHandler)

// Start server
const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => {
  console.log(`🚀 Frigg Management UI server running on port ${PORT}`)
  console.log(`📡 WebSocket server ready for connections`)
  console.log(`📚 API documentation: http://localhost:${PORT}/api`)
  console.log(`🏥 Health check: http://localhost:${PORT}/health`)
<<<<<<< HEAD

=======
<<<<<<< HEAD

=======
  
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
  // Log server startup
  addLogEntry(LOG_LEVELS.INFO, `Server started on port ${PORT}`, 'server', {
    port: PORT,
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || 'development'
  })
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...')
  addLogEntry(LOG_LEVELS.INFO, 'Server shutting down gracefully', 'server')
<<<<<<< HEAD

=======
<<<<<<< HEAD

=======
  
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
  httpServer.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...')
  addLogEntry(LOG_LEVELS.INFO, 'Server interrupted, shutting down', 'server')
<<<<<<< HEAD

=======
<<<<<<< HEAD

=======
  
>>>>>>> 652520a5 (Claude Flow RFC related development)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
  httpServer.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

export default app