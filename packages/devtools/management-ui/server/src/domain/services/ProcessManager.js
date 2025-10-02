import { spawn } from 'child_process'
import { EventEmitter } from 'events'
import { existsSync } from 'fs'
import { resolve, basename } from 'path'

/**
 * ProcessManager - Singleton service for managing Frigg process lifecycle
 *
 * Responsibilities:
 * - Start and stop Frigg project processes
 * - Track process state (PID, port, uptime)
 * - Stream process output to WebSocket clients
 * - Handle graceful shutdown and cleanup
 * - Detect port from process output
 */
export class ProcessManager extends EventEmitter {
  constructor() {
    super()
    this.process = null
    this.pid = null
    this.port = null
    this.startTime = null
    this.repositoryPath = null
    this.isStarting = false
  }

  /**
   * Check if a port is in use and attempt to kill the process
   * @param {number} port - Port to check
   * @returns {Promise<boolean>} - True if port was cleaned up
   */
  async cleanupPort(port) {
    const { execSync } = await import('child_process')

    try {
      // Check if port is in use (macOS/Linux)
      const result = execSync(`lsof -ti:${port} 2>/dev/null || true`, { encoding: 'utf8' }).trim()

      if (result && result.length > 0) {
        const pids = result.split('\n').filter(pid => pid.length > 0)
        console.log(`Port ${port} is in use by PIDs: ${pids.join(', ')}`)

        // Kill the processes
        for (const pid of pids) {
          try {
            execSync(`kill -9 ${pid}`)
            console.log(`Killed process ${pid} on port ${port}`)
          } catch (err) {
            console.log(`Could not kill process ${pid}: ${err.message}`)
          }
        }

        // Wait a moment for cleanup
        await new Promise(resolve => setTimeout(resolve, 1000))

        return true
      }
    } catch (err) {
      console.log(`Error checking port ${port}: ${err.message}`)
    }

    return false
  }

  /**
   * Cleanup Frigg process ports (NOT Docker services like LocalStack)
   * Only cleans: 3001 (HTTP), 4001 (Lambda offline)
   * Does NOT clean: 4566 (LocalStack - Docker), 27017 (MongoDB - Docker)
   * @returns {Promise<boolean>} - True if any ports were cleaned
   */
  async cleanupAllPorts() {
    const ports = [3001, 4001] // Only Frigg process ports, not Docker services
    let anyCleanedUp = false

    for (const port of ports) {
      const cleaned = await this.cleanupPort(port)
      if (cleaned) {
        anyCleanedUp = true
      }
    }

    return anyCleanedUp
  }

  /**
   * Check if there's already a Frigg process running by checking for processes on Frigg ports
   * Only checks typical Frigg serverless ports (3000-3002), NOT management UI ports (3210)
   * @returns {Promise<object|null>} - Port info if found, null otherwise
   */
  async detectExistingProcess() {
    const { execSync } = await import('child_process')

    // Only check typical Frigg serverless ports: 3000, 3001, 3002
    // Exclude: 3210 (Management UI), 4001 (Lambda offline), 4566 (LocalStack)
    const friggPorts = [3000, 3001, 3002]

    for (const port of friggPorts) {
      try {
        const result = execSync(`lsof -ti:${port} 2>/dev/null || true`, { encoding: 'utf8' }).trim()
        if (result && result.length > 0) {
          // Found a process on this port - check if it's a node process
          try {
            const processInfo = execSync(`lsof -i:${port} | grep node`, { encoding: 'utf8' }).trim()
            if (processInfo.includes('node')) {
              // Further check: make sure it's not the management UI itself
              const cmdCheck = execSync(`ps -p ${result.split('\n')[0]} -o command=`, { encoding: 'utf8' }).trim()

              // Skip if it's the management UI server
              if (cmdCheck.includes('management-ui') && cmdCheck.includes('server')) {
                console.log(`Skipping port ${port} - it's the Management UI server`)
                continue
              }

              console.log(`Detected existing Frigg serverless process on port ${port}`)
              return { port, detected: true }
            }
          } catch (err) {
            // Not a node process, skip
          }
        }
      } catch (err) {
        // Port not in use, continue
      }
    }

    return null
  }

  /**
   * Find backend directory - checks if we're already in backend or finds it
   * @param {string} repositoryPath - Path to search from
   * @returns {string} - Path to backend directory
   */
  findBackendPath(repositoryPath) {
    const absolutePath = resolve(repositoryPath)

    // Check if we're already in a backend directory (has infrastructure.js)
    const currentInfra = resolve(absolutePath, 'infrastructure.js')
    if (existsSync(currentInfra)) {
      console.log('Already in backend directory:', absolutePath)
      return absolutePath
    }

    // Check if path ends with 'backend'
    if (basename(absolutePath) === 'backend') {
      const infraPath = resolve(absolutePath, 'infrastructure.js')
      if (existsSync(infraPath)) {
        console.log('Path is backend directory:', absolutePath)
        return absolutePath
      }
    }

    // Check for backend subdirectory
    const backendSubdir = resolve(absolutePath, 'backend')
    if (existsSync(backendSubdir)) {
      const backendInfra = resolve(backendSubdir, 'infrastructure.js')
      if (existsSync(backendInfra)) {
        console.log('Found backend subdirectory:', backendSubdir)
        return backendSubdir
      }
    }

    // If none found, return the path with /backend (will fail with clear error)
    return resolve(absolutePath, 'backend')
  }

  /**
   * Start a Frigg project
   * @param {string} repositoryPath - Path to the Frigg project
   * @param {object} webSocketService - WebSocket service for log streaming
   * @returns {Promise<object>} - Process status
   */
  async start(repositoryPath, webSocketService, options = {}) {
    if (this.process && !this.process.killed) {
      throw new Error('A Frigg process is already running')
    }

    if (this.isStarting) {
      throw new Error('A Frigg process is already starting')
    }

    this.isStarting = true
    this.repositoryPath = repositoryPath

    return new Promise(async (resolve, reject) => {
      try {
        // Check and cleanup all Frigg ports before starting
        const cleanupLog = {
          level: 'info',
          message: 'Checking for stale Frigg processes...',
          timestamp: new Date().toISOString(),
          source: 'process-manager'
        }
        webSocketService.emit('frigg:log', cleanupLog)

        const portsCleaned = await this.cleanupAllPorts()
        if (portsCleaned) {
          const successLog = {
            level: 'info',
            message: 'Cleaned up stale Frigg processes on ports 3001, 4001',
            timestamp: new Date().toISOString(),
            source: 'process-manager'
          }
          webSocketService.emit('frigg:log', successLog)
        } else {
          const readyLog = {
            level: 'info',
            message: 'Frigg ports are clear, ready to start',
            timestamp: new Date().toISOString(),
            source: 'process-manager'
          }
          webSocketService.emit('frigg:log', readyLog)
        }

        // Find backend directory (smart detection)
        const backendPath = this.findBackendPath(repositoryPath)
        console.log('Starting Frigg from:', backendPath)

        // Merge provided env variables with process.env
        const processEnv = {
          ...process.env,
          ...(options.env || {})
        }

        const friggProcess = spawn('frigg', ['start'], {
          cwd: backendPath,
          env: processEnv,
          shell: true // Enable shell to find frigg command
        })

        this.process = friggProcess
        this.pid = friggProcess.pid
        this.startTime = new Date()

        let portDetected = false
        let startupBuffer = ''
        const startupTimeout = setTimeout(() => {
          if (!portDetected) {
            this.isStarting = false
            this.cleanup()
            reject(new Error('Timeout waiting for Frigg to start (no port detected)'))
          }
        }, 30000) // 30 second timeout

        // Listen to stdout
        friggProcess.stdout.on('data', (data) => {
          const message = data.toString()
          startupBuffer += message

          // Parse log level from console output (e.g., [INFO], [ERROR], [WARN])
          let logLevel = 'info'
          const levelMatch = message.match(/\[(INFO|ERROR|WARN|DEBUG|SUCCESS)\]/i)

          if (levelMatch) {
            logLevel = levelMatch[1].toLowerCase()
          } else {
            // Fallback: classify based on content if no explicit level
            const lowerMessage = message.toLowerCase()
            if (lowerMessage.includes('error') || lowerMessage.includes('failed')) {
              logLevel = 'error'
            } else if (lowerMessage.includes('warn') || lowerMessage.includes('deprecated')) {
              logLevel = 'warn'
            } else if (lowerMessage.includes('server ready') || lowerMessage.includes('🚀')) {
              logLevel = 'success'
            }
          }

          // Try to detect port from output - multiple patterns
          // Only look for HTTP server port (3000-3999 range), not LocalStack (4566) or Lambda (4001)
          if (!portDetected) {
            // Pattern 1: Server ready: http://localhost:3001 🚀
            let portMatch = message.match(/Server ready:.*?:(\d{4,5})/i)

            // Pattern 2: listening on http://localhost:3000
            if (!portMatch) {
              portMatch = message.match(/listening on.*?:(\d{4,5})/i)
            }

            // Pattern 3: Offline listening on http://localhost:3001
            if (!portMatch) {
              portMatch = message.match(/Offline listening on.*?:(\d{4,5})/i)
            }

            if (portMatch) {
              const detectedPort = parseInt(portMatch[1])

              // Only accept ports in the 3000-3999 range (HTTP server)
              // Reject 4001 (Lambda offline) and 4566 (LocalStack)
              if (detectedPort >= 3000 && detectedPort < 4000) {
                this.port = detectedPort
                portDetected = true
                this.isStarting = false
                clearTimeout(startupTimeout)

                const status = this.getStatus()
                resolve(status)
              }
            }
          }

          // Emit log to WebSocket
          const log = {
            level: logLevel,
            message: message.trim(),
            timestamp: new Date().toISOString(),
            source: 'frigg-process'
          }
          webSocketService.emit('frigg:log', log)
          this.emit('log', log)
        })

        // Listen to stderr
        friggProcess.stderr.on('data', (data) => {
          const message = data.toString()

          // Parse log level from console output first
          let logLevel = 'error' // Default for stderr
          const levelMatch = message.match(/\[(INFO|ERROR|WARN|DEBUG|SUCCESS)\]/i)

          if (levelMatch) {
            logLevel = levelMatch[1].toLowerCase()
          } else {
            // Fallback: classify stderr content
            const lowerMessage = message.toLowerCase()
            const trimmedMessage = message.trim()

            // Informational messages that go to stderr (serverless-offline outputs to stderr)
            if (lowerMessage.includes('running "serverless"') ||
                lowerMessage.includes('dotenv:') ||
                lowerMessage.includes('starting offline') ||
                lowerMessage.includes('function names exposed') ||
                lowerMessage.includes('server ready') ||
                lowerMessage.includes('offline') && lowerMessage.includes('listening') ||
                lowerMessage.includes('initializing') ||
                // HTTP request logs from serverless-offline (e.g., "GET /api/integrations (λ: auth)")
                message.match(/^(GET|POST|PUT|PATCH|DELETE|ANY)\s+\//) ||
                // Lambda execution logs (e.g., "(λ: auth) RequestId: ... Duration: ...")
                message.match(/^\(λ:.*\)\s+(RequestId|Running in offline mode)/) ||
                // Empty lines / whitespace only
                trimmedMessage.length === 0) {
              logLevel = 'info'
            }
            // Actual warnings (deprecations)
            else if (lowerMessage.includes('deprecation') ||
                     lowerMessage.includes('warning:')) {
              logLevel = 'warn'
            }
          }

          // Check for port in stderr too (serverless offline outputs here)
          // Only look for HTTP server port (3000-3999 range)
          if (!portDetected) {
            let portMatch = message.match(/Server ready:.*?:(\d{4,5})/i)
            if (!portMatch) {
              portMatch = message.match(/listening on.*?:(\d{4,5})/i)
            }
            if (!portMatch) {
              portMatch = message.match(/Offline listening on.*?:(\d{4,5})/i)
            }

            if (portMatch) {
              const detectedPort = parseInt(portMatch[1])

              // Only accept ports in the 3000-3999 range (HTTP server)
              // Reject 4001 (Lambda offline) and 4566 (LocalStack)
              if (detectedPort >= 3000 && detectedPort < 4000) {
                this.port = detectedPort
                portDetected = true
                this.isStarting = false
                clearTimeout(startupTimeout)

                const status = this.getStatus()
                resolve(status)
              }
            }
          }

          const log = {
            level: logLevel,
            message: message.trim(),
            timestamp: new Date().toISOString(),
            source: 'frigg-process'
          }
          webSocketService.emit('frigg:log', log)
          this.emit('log', log)
        })

        // Handle process exit
        friggProcess.on('exit', (code, signal) => {
          clearTimeout(startupTimeout)
          this.isStarting = false

          // Check if exit was due to startup failure (port in use, etc.)
          if (code !== 0 && !portDetected) {
            // Startup failure - check for common issues
            const portInUse = startupBuffer.includes('EADDRINUSE') ||
                             startupBuffer.includes('address already in use')

            const localstackDown = startupBuffer.includes('ECONNREFUSED') &&
                                  (startupBuffer.includes(':4566') || startupBuffer.includes('localhost:4566'))

            if (portInUse) {
              const errorLog = {
                level: 'error',
                message: `Failed to start: Port already in use. Another Frigg process may be running. Ports were cleaned but process started too quickly.`,
                timestamp: new Date().toISOString(),
                source: 'process-manager'
              }
              webSocketService.emit('frigg:log', errorLog)
              this.emit('error', new Error('Port already in use'))
              this.cleanup()
              reject(new Error('Failed to start: Port is already in use. Please wait a moment and try again.'))
              return
            }

            if (localstackDown) {
              const errorLog = {
                level: 'error',
                message: `Failed to start: LocalStack is not running on port 4566. Start LocalStack with 'docker-compose up' or 'localstack start'`,
                timestamp: new Date().toISOString(),
                source: 'process-manager'
              }
              webSocketService.emit('frigg:log', errorLog)
              this.emit('error', new Error('LocalStack not running'))
              this.cleanup()
              reject(new Error('Failed to start: LocalStack is not running. Start it with docker-compose or localstack CLI.'))
              return
            }

            // Other startup failure
            const errorLog = {
              level: 'error',
              message: `Frigg process failed to start (exit code ${code}). Check logs for details.`,
              timestamp: new Date().toISOString(),
              source: 'process-manager'
            }
            webSocketService.emit('frigg:log', errorLog)
            this.emit('error', new Error(`Process exited with code ${code}`))
            this.cleanup()
            reject(new Error(`Failed to start Frigg (exit code ${code}). Check logs for details.`))
            return
          }

          // Normal exit or exit after successful start
          const exitLog = {
            level: code === 0 ? 'info' : 'warn',
            message: `Frigg process exited with code ${code} (signal: ${signal})`,
            timestamp: new Date().toISOString(),
            source: 'process-manager'
          }
          webSocketService.emit('frigg:log', exitLog)
          this.emit('exit', { code, signal })

          this.cleanup()
        })

        // Handle process errors
        friggProcess.on('error', (err) => {
          clearTimeout(startupTimeout)
          this.isStarting = false

          const errorLog = {
            level: 'error',
            message: `Failed to start Frigg process: ${err.message}`,
            timestamp: new Date().toISOString(),
            source: 'process-manager'
          }
          webSocketService.emit('frigg:log', errorLog)
          this.emit('error', err)

          this.cleanup()
          reject(err)
        })

      } catch (err) {
        this.isStarting = false
        reject(err)
      }
    })
  }

  /**
   * Stop the Frigg process
   * @param {boolean} force - Whether to force kill immediately
   * @param {number} timeout - Timeout in ms before force killing
   * @returns {Promise<object>} - Stop status
   */
  async stop(force = false, timeout = 5000) {
    if (!this.process || this.process.killed) {
      return {
        isRunning: false,
        message: 'No Frigg process is running'
      }
    }

    return new Promise((resolve) => {
      const pid = this.pid

      if (force) {
        // Immediate force kill
        this.process.kill('SIGKILL')
        this.cleanup()
        resolve({
          isRunning: false,
          message: `Frigg process ${pid} force killed`
        })
        return
      }

      // Graceful shutdown with timeout
      const forceKillTimer = setTimeout(() => {
        if (this.process && !this.process.killed) {
          console.log('Process did not exit gracefully, force killing...')
          this.process.kill('SIGKILL')
        }
      }, timeout)

      this.process.once('exit', () => {
        clearTimeout(forceKillTimer)
        this.cleanup()
        resolve({
          isRunning: false,
          message: `Frigg process ${pid} stopped gracefully`
        })
      })

      // Send SIGTERM for graceful shutdown
      this.process.kill('SIGTERM')
    })
  }

  /**
   * Check if Frigg process is running
   * @returns {boolean}
   */
  isRunning() {
    return this.process !== null && !this.process.killed
  }

  /**
   * Get current process status
   * @returns {object}
   */
  getStatus() {
    if (!this.isRunning()) {
      return {
        isRunning: false,
        status: 'stopped'
      }
    }

    const uptime = this.startTime
      ? Math.floor((Date.now() - this.startTime.getTime()) / 1000)
      : 0

    return {
      isRunning: true,
      status: 'running',
      pid: this.pid,
      port: this.port,
      baseUrl: this.port ? `http://localhost:${this.port}` : null,
      startTime: this.startTime?.toISOString(),
      uptime,
      repositoryPath: this.repositoryPath
    }
  }

  /**
   * Clean up process references
   */
  cleanup() {
    this.process = null
    this.pid = null
    this.port = null
    this.startTime = null
    this.repositoryPath = null
    this.isStarting = false
  }
}