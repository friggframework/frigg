import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import fs from 'fs/promises'
import processManager from './processManager.js'
import cliIntegration from './utils/cliIntegration.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
})

app.use(cors())
app.use(express.json())

// In-memory state (for development)
const mockIntegrations = []
const mockUsers = []
const mockConnections = []
const envVariables = {}

// Set up process manager listeners
processManager.addStatusListener((data) => {
  io.emit('frigg:status', data)
  
  // Also emit logs if present
  if (data.log) {
    io.emit('frigg:log', data.log)
  }
})

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)
  
  // Send initial status
  socket.emit('frigg:status', processManager.getStatus())
  
  // Send recent logs
  const recentLogs = processManager.getLogs(50)
  if (recentLogs.length > 0) {
    socket.emit('frigg:logs', recentLogs)
  }
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id)
  })
})

// API Routes

// Frigg server control
app.get('/api/frigg/status', (req, res) => {
  res.json(processManager.getStatus())
})

app.get('/api/frigg/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100
  res.json({ logs: processManager.getLogs(limit) })
})

app.get('/api/frigg/metrics', (req, res) => {
  res.json(processManager.getMetrics())
})

app.post('/api/frigg/start', async (req, res) => {
  try {
    const options = {
      stage: req.body.stage || 'dev',
      verbose: req.body.verbose || false
    }
    
    const result = await processManager.start(options)
    res.json({ 
      message: 'Frigg started successfully',
      status: result
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/frigg/stop', async (req, res) => {
  try {
    const force = req.body.force || false
    await processManager.stop(force)
    res.json({ message: 'Frigg stopped successfully' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/frigg/restart', async (req, res) => {
  try {
    const options = {
      stage: req.body.stage || 'dev',
      verbose: req.body.verbose || false
    }
    
    const result = await processManager.restart(options)
    res.json({ 
      message: 'Frigg restarted successfully',
      status: result
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Integrations
app.get('/api/integrations', (req, res) => {
  res.json({ integrations: mockIntegrations })
})

app.post('/api/integrations/install', async (req, res) => {
  const { name } = req.body
  
  try {
    // In real implementation, this would run frigg install command
    const newIntegration = {
      id: Date.now().toString(),
      name,
      displayName: name.charAt(0).toUpperCase() + name.slice(1),
      description: `${name} integration`,
      installed: true,
      installedAt: new Date().toISOString()
    }
    
    mockIntegrations.push(newIntegration)
    io.emit('integrations:update', { integrations: mockIntegrations })
    
    res.json({ integration: newIntegration })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Environment variables
app.get('/api/environment', async (req, res) => {
  try {
    // In real implementation, read from .env file
    res.json({ variables: envVariables })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.put('/api/environment', async (req, res) => {
  const { key, value } = req.body
  
  try {
    envVariables[key] = value
    // In real implementation, write to .env file
    res.json({ message: 'Environment variable updated' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Users
app.get('/api/users', (req, res) => {
  res.json({ users: mockUsers })
})

app.post('/api/users', (req, res) => {
  const newUser = {
    id: Date.now().toString(),
    ...req.body,
    createdAt: new Date().toISOString()
  }
  
  mockUsers.push(newUser)
  res.json({ user: newUser })
})

// Connections
app.get('/api/connections', (req, res) => {
  res.json({ connections: mockConnections })
})

// CLI Integration endpoints
app.get('/api/cli/info', async (req, res) => {
  try {
    const isAvailable = await cliIntegration.validateCLI()
    const info = isAvailable ? await cliIntegration.getInfo() : null
    
    res.json({ 
      available: isAvailable,
      info,
      cliPath: cliIntegration.cliPath
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/cli/build', async (req, res) => {
  try {
    const options = {
      stage: req.body.stage || 'dev',
      verbose: req.body.verbose || false,
      cwd: req.body.cwd || process.cwd()
    }
    
    const result = await cliIntegration.buildProject(options)
    res.json({ 
      message: 'Build completed successfully',
      output: result.stdout,
      errors: result.stderr
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/cli/deploy', async (req, res) => {
  try {
    const options = {
      stage: req.body.stage || 'dev',
      verbose: req.body.verbose || false,
      cwd: req.body.cwd || process.cwd()
    }
    
    const result = await cliIntegration.deployProject(options)
    res.json({ 
      message: 'Deploy completed successfully',
      output: result.stdout,
      errors: result.stderr
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/cli/create-integration', async (req, res) => {
  try {
    const integrationName = req.body.name
    const options = {
      cwd: req.body.cwd || process.cwd(),
      verbose: req.body.verbose || false
    }
    
    const result = await cliIntegration.createIntegration(integrationName, options)
    res.json({ 
      message: 'Integration created successfully',
      output: result.stdout,
      errors: result.stderr
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/cli/generate-iam', async (req, res) => {
  try {
    const options = {
      output: req.body.output,
      user: req.body.user,
      stackName: req.body.stackName,
      verbose: req.body.verbose || false,
      cwd: req.body.cwd || process.cwd()
    }
    
    const result = await cliIntegration.generateIAM(options)
    res.json({ 
      message: 'IAM template generated successfully',
      output: result.stdout,
      errors: result.stderr
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')))
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'))
  })
}

// Start server
const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => {
  console.log(`Management UI server running on port ${PORT}`)
})