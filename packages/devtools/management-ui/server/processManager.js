import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'

class FriggProcessManager {
  constructor() {
    this.process = null
    this.status = 'stopped'
    this.listeners = new Set()
    this.logs = []
    this.maxLogs = 1000
  }

  // Add status change listener
  addStatusListener(listener) {
    this.listeners.add(listener)
  }

  // Remove status change listener
  removeStatusListener(listener) {
    this.listeners.delete(listener)
  }

  // Notify all listeners of status change
  notifyListeners(status, data = {}) {
    this.status = status
    this.listeners.forEach(listener => {
      try {
        listener({ status, ...data })
      } catch (error) {
        console.error('Error notifying status listener:', error)
      }
    })
  }

  // Add log entry
  addLog(type, message) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type, // 'stdout', 'stderr', 'system'
      message
    }
    
    this.logs.push(logEntry)
    
    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs)
    }

    // Notify listeners of new log
    this.listeners.forEach(listener => {
      try {
        listener({ status: this.status, log: logEntry })
      } catch (error) {
        console.error('Error notifying log listener:', error)
      }
    })
  }

  // Get current status
  getStatus() {
    return {
      status: this.status,
      pid: this.process?.pid || null,
      uptime: this.process ? Date.now() - this.startTime : 0
    }
  }

  // Get recent logs
  getLogs(limit = 100) {
    return this.logs.slice(-limit)
  }

  // Find project root with infrastructure.js
  async findProjectRoot(startPath = process.cwd()) {
    let currentPath = startPath
    
    while (currentPath !== path.dirname(currentPath)) {
      try {
        const infraPath = path.join(currentPath, 'infrastructure.js')
        await fs.access(infraPath)
        return currentPath
      } catch {
        currentPath = path.dirname(currentPath)
      }
    }
    
    throw new Error('Could not find infrastructure.js file in project hierarchy')
  }

  // Start Frigg process
  async start(options = {}) {
    if (this.status === 'running') {
      throw new Error('Frigg is already running')
    }

    if (this.status === 'starting') {
      throw new Error('Frigg is already starting')
    }

    try {
      this.notifyListeners('starting')
      this.addLog('system', 'Starting Frigg server...')

      // Find project root
      const projectRoot = await this.findProjectRoot()
      this.addLog('system', `Project root found: ${projectRoot}`)

      // Suppress AWS SDK warning
      const env = {
        ...process.env,
        AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE: '1'
      }

      // Build serverless command
      const command = 'serverless'
      const args = [
        'offline',
        '--config',
        'infrastructure.js',
        '--stage',
        options.stage || 'dev'
      ]

      if (options.verbose) {
        args.push('--verbose')
      }

      this.addLog('system', `Executing: ${command} ${args.join(' ')}`)
      this.addLog('system', `Working directory: ${projectRoot}`)

      // Spawn the process
      this.process = spawn(command, args, {
        cwd: projectRoot,
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      this.startTime = Date.now()

      // Handle stdout
      this.process.stdout.on('data', (data) => {
        const message = data.toString().trim()
        if (message) {
          this.addLog('stdout', message)
        }
      })

      // Handle stderr
      this.process.stderr.on('data', (data) => {
        const message = data.toString().trim()
        if (message) {
          this.addLog('stderr', message)
        }
      })

      // Handle process events
      this.process.on('spawn', () => {
        this.addLog('system', `Process spawned with PID: ${this.process.pid}`)
        this.notifyListeners('running', { pid: this.process.pid })
      })

      this.process.on('error', (error) => {
        this.addLog('system', `Process error: ${error.message}`)
        this.notifyListeners('stopped', { error: error.message })
        this.cleanup()
      })

      this.process.on('close', (code, signal) => {
        const message = signal 
          ? `Process terminated by signal: ${signal}`
          : `Process exited with code: ${code}`
        
        this.addLog('system', message)
        this.notifyListeners('stopped', { code, signal })
        this.cleanup()
      })

      // Return promise that resolves when process is fully started
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for Frigg to start'))
        }, 30000) // 30 second timeout

        const checkStarted = () => {
          if (this.status === 'running') {
            clearTimeout(timeout)
            resolve(this.getStatus())
          } else if (this.status === 'stopped') {
            clearTimeout(timeout)
            reject(new Error('Failed to start Frigg'))
          } else {
            setTimeout(checkStarted, 100)
          }
        }

        checkStarted()
      })

    } catch (error) {
      this.addLog('system', `Failed to start: ${error.message}`)
      this.notifyListeners('stopped', { error: error.message })
      this.cleanup()
      throw error
    }
  }

  // Stop Frigg process
  async stop(force = false) {
    if (this.status === 'stopped') {
      throw new Error('Frigg is already stopped')
    }

    return new Promise((resolve) => {
      if (!this.process) {
        this.notifyListeners('stopped')
        resolve()
        return
      }

      this.addLog('system', force ? 'Force stopping Frigg server...' : 'Stopping Frigg server...')
      this.notifyListeners('stopping')

      // Set up cleanup timeout
      const timeout = setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.addLog('system', 'Force killing process after timeout')
          this.process.kill('SIGKILL')
        }
      }, 5000) // 5 second timeout for graceful shutdown

      // Listen for process to actually exit
      const onClose = () => {
        clearTimeout(timeout)
        resolve()
      }

      if (this.process.exitCode !== null || this.process.killed) {
        // Process already exited
        onClose()
      } else {
        this.process.once('close', onClose)
        
        // Send termination signal
        if (force) {
          this.process.kill('SIGKILL')
        } else {
          this.process.kill('SIGTERM')
        }
      }
    })
  }

  // Restart Frigg process
  async restart(options = {}) {
    this.addLog('system', 'Restarting Frigg server...')
    
    if (this.status !== 'stopped') {
      await this.stop()
    }
    
    // Wait a bit before restarting
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    return this.start(options)
  }

  // Clean up process references
  cleanup() {
    if (this.process) {
      this.process.removeAllListeners()
      this.process = null
    }
    this.startTime = null
  }

  // Get process metrics
  getMetrics() {
    if (!this.process || this.status !== 'running') {
      return null
    }

    return {
      pid: this.process.pid,
      uptime: Date.now() - this.startTime,
      memoryUsage: process.memoryUsage(), // This is the manager's memory, not the child's
      status: this.status
    }
  }
}

// Create singleton instance
const processManager = new FriggProcessManager()

export default processManager