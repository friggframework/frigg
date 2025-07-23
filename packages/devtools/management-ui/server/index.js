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

<<<<<<< HEAD
<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
=======
>>>>>>> 7e97f01c (fix: resolve ui-command merge conflicts and update package.json)
class FriggManagementServer {
  constructor(options = {}) {
    this.port = options.port || process.env.PORT || 3001
    this.projectRoot = options.projectRoot || process.cwd()
    this.repositoryInfo = options.repositoryInfo || null
    this.app = null
    this.httpServer = null
    this.io = null
    this.mockIntegrations = []
    this.mockUsers = []
    this.mockConnections = []
    this.envVariables = {}
<<<<<<< HEAD
<<<<<<< HEAD
=======
<<<<<<< HEAD
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
=======
>>>>>>> 7e97f01c (fix: resolve ui-command merge conflicts and update package.json)
  }

  async start() {
    this.app = express()
    this.httpServer = createServer(this.app)
    this.io = new Server(this.httpServer, {
      cors: {
        origin: ["http://localhost:5173", "http://localhost:3000"],
        methods: ["GET", "POST"]
      }
    })

    this.setupMiddleware()
    this.setupSocketIO()
    this.setupRoutes()
    this.setupStaticFiles()

    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.port, (err) => {
        if (err) {
          reject(err)
        } else {
          console.log(`Management UI server running on port ${this.port}`)
          if (this.repositoryInfo) {
            console.log(`Connected to repository: ${this.repositoryInfo.name}`)
          }
          resolve()
        }
      })
    })
  }

  setupMiddleware() {
    this.app.use(cors())
    this.app.use(express.json())
  }

  setupSocketIO() {
    // Set up process manager listeners
    processManager.addStatusListener((data) => {
      this.io.emit('frigg:status', data)

      // Also emit logs if present
      if (data.log) {
        this.io.emit('frigg:log', data.log)
      }
    })

    // Socket.IO connection handling
    this.io.on('connection', (socket) => {
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
  }

  setupRoutes() {
    const app = this.app
    const io = this.io
    const mockIntegrations = this.mockIntegrations
    const mockUsers = this.mockUsers
    const mockConnections = this.mockConnections
    const envVariables = this.envVariables

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

  }

  setupStaticFiles() {
    // Serve static files in production
    if (process.env.NODE_ENV === 'production') {
      this.app.use(express.static(path.join(__dirname, '../dist')))
      this.app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../dist/index.html'))
      })
    } else {
      // In development, provide helpful message
      this.app.get('/', (req, res) => {
        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Frigg Management UI - Development Mode</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: #f5f5f5;
              }
              .container {
                text-align: center;
                padding: 2rem;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                max-width: 600px;
              }
              h1 { color: #333; }
              p { color: #666; line-height: 1.6; }
              code {
                background: #f0f0f0;
                padding: 0.2rem 0.4rem;
                border-radius: 3px;
                font-family: 'Consolas', 'Monaco', monospace;
              }
              .status { 
                margin: 1rem 0;
                padding: 1rem;
                background: #e3f2fd;
                border-radius: 4px;
                color: #1976d2;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Frigg Management UI</h1>
              <div class="status">
                <strong>Backend API Server is running on port ${this.port}</strong>
              </div>
              <p>
                The Management UI requires both the backend server (running now) and the frontend development server.
              </p>
              <p>
                To start the complete Management UI, run the following commands in the management-ui directory:
              </p>
              <p>
                <code>cd ${path.join(__dirname, '..')}</code><br>
                <code>npm run dev:server</code>
              </p>
              <p>
                This will start both the backend API server and the Vite frontend dev server.
                The UI will be available at <strong>http://localhost:5173</strong>
              </p>
            </div>
          </body>
          </html>
        `)
      })
    }
  }

  stop() {
    return new Promise((resolve) => {
      if (this.httpServer) {
        this.httpServer.close(() => {
          console.log('Management UI server stopped')
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
}

// Export the class for use as a module
export { FriggManagementServer }

// If run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new FriggManagementServer()
  server.start().catch(console.error)
<<<<<<< HEAD
<<<<<<< HEAD
}
=======
}
=======
const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
=======
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
  }

  async start() {
    this.app = express()
    this.httpServer = createServer(this.app)
    this.io = new Server(this.httpServer, {
      cors: {
        origin: ["http://localhost:5173", "http://localhost:3000"],
        methods: ["GET", "POST"]
      }
    })

    this.setupMiddleware()
    this.setupSocketIO()
    this.setupRoutes()
    this.setupStaticFiles()

    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.port, (err) => {
        if (err) {
          reject(err)
        } else {
          console.log(`Management UI server running on port ${this.port}`)
          if (this.repositoryInfo) {
            console.log(`Connected to repository: ${this.repositoryInfo.name}`)
          }
          resolve()
        }
      })
    })
  }

  setupMiddleware() {
    this.app.use(cors())
    this.app.use(express.json())
  }

  setupSocketIO() {
    // Set up process manager listeners
    processManager.addStatusListener((data) => {
      this.io.emit('frigg:status', data)
      
      // Also emit logs if present
      if (data.log) {
        this.io.emit('frigg:log', data.log)
      }
    })

    // Socket.IO connection handling
    this.io.on('connection', (socket) => {
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
  }

  setupRoutes() {
    const app = this.app
    const io = this.io
    const mockIntegrations = this.mockIntegrations
    const mockUsers = this.mockUsers
    const mockConnections = this.mockConnections
    const envVariables = this.envVariables

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

  }

  setupStaticFiles() {
    // Serve static files in production
    if (process.env.NODE_ENV === 'production') {
      this.app.use(express.static(path.join(__dirname, '../dist')))
      this.app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../dist/index.html'))
      })
    } else {
      // In development, provide helpful message
      this.app.get('/', (req, res) => {
        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Frigg Management UI - Development Mode</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: #f5f5f5;
              }
              .container {
                text-align: center;
                padding: 2rem;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                max-width: 600px;
              }
              h1 { color: #333; }
              p { color: #666; line-height: 1.6; }
              code {
                background: #f0f0f0;
                padding: 0.2rem 0.4rem;
                border-radius: 3px;
                font-family: 'Consolas', 'Monaco', monospace;
              }
              .status { 
                margin: 1rem 0;
                padding: 1rem;
                background: #e3f2fd;
                border-radius: 4px;
                color: #1976d2;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Frigg Management UI</h1>
              <div class="status">
                <strong>Backend API Server is running on port ${this.port}</strong>
              </div>
              <p>
                The Management UI requires both the backend server (running now) and the frontend development server.
              </p>
              <p>
                To start the complete Management UI, run the following commands in the management-ui directory:
              </p>
              <p>
                <code>cd ${path.join(__dirname, '..')}</code><br>
                <code>npm run dev:server</code>
              </p>
              <p>
                This will start both the backend API server and the Vite frontend dev server.
                The UI will be available at <strong>http://localhost:5173</strong>
              </p>
            </div>
          </body>
          </html>
        `)
      })
    }
  }

  stop() {
    return new Promise((resolve) => {
      if (this.httpServer) {
        this.httpServer.close(() => {
          console.log('Management UI server stopped')
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
}

<<<<<<< HEAD
// Start server
const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => {
  console.log(`Management UI server running on port ${PORT}`)
})
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
// Export the class for use as a module
export { FriggManagementServer }

// If run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new FriggManagementServer()
  server.start().catch(console.error)
}
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
=======
}
>>>>>>> 7e97f01c (fix: resolve ui-command merge conflicts and update package.json)
