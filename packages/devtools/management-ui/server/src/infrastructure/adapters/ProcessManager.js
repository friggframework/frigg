import { spawn, exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Manages the lifecycle of the Frigg project process
 */
export class ProcessManager {
  constructor() {
    this.processes = new Map()
  }

  async startProject({ path: projectPath, env = {}, port = 3000 }) {
    // Check if already running
    const existingProcess = Array.from(this.processes.values())
      .find(p => p.projectPath === projectPath)

    if (existingProcess && this.isProcessRunning(existingProcess.pid)) {
      throw new Error('Project is already running')
    }

    // Start the project
    const processEnv = {
      ...process.env,
      PORT: port,
      NODE_ENV: 'development',
      ...env
    }

    const child = spawn('npm', ['run', 'dev'], {
      cwd: projectPath,
      env: processEnv,
      stdio: 'pipe',
      shell: true
    })

    const processInfo = {
      pid: child.pid,
      port,
      projectPath,
      startTime: new Date(),
      process: child,
      logs: []
    }

    // Capture output
    child.stdout.on('data', (data) => {
      const message = data.toString()
      processInfo.logs.push({ type: 'stdout', message, timestamp: new Date() })
      console.log(`[Project ${child.pid}]`, message)
    })

    child.stderr.on('data', (data) => {
      const message = data.toString()
      processInfo.logs.push({ type: 'stderr', message, timestamp: new Date() })
      console.error(`[Project ${child.pid}]`, message)
    })

    child.on('exit', (code) => {
      console.log(`Project process ${child.pid} exited with code ${code}`)
      this.processes.delete(child.pid)
    })

    this.processes.set(child.pid, processInfo)

    // Wait a bit for the process to start
    await new Promise(resolve => setTimeout(resolve, 2000))

    return {
      pid: child.pid,
      port,
      status: 'running'
    }
  }

  async stopProject(pid) {
    const processInfo = this.processes.get(pid)
    if (!processInfo) {
      throw new Error(`Process ${pid} not found`)
    }

    try {
      // Try graceful shutdown first
      processInfo.process.kill('SIGTERM')

      // Wait for process to exit
      await new Promise((resolve) => {
        let checkCount = 0
        const checkInterval = setInterval(() => {
          if (!this.isProcessRunning(pid) || checkCount > 10) {
            clearInterval(checkInterval)
            resolve()
          }
          checkCount++
        }, 500)
      })

      // Force kill if still running
      if (this.isProcessRunning(pid)) {
        processInfo.process.kill('SIGKILL')
      }

      this.processes.delete(pid)
      return { success: true }
    } catch (error) {
      throw new Error(`Failed to stop process: ${error.message}`)
    }
  }

  async isProcessRunning(pid) {
    if (!pid) return false

    try {
      // Check if process exists
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  async getProcessInfo(pid) {
    const processInfo = this.processes.get(pid)
    if (!processInfo) {
      return null
    }

    const isRunning = await this.isProcessRunning(pid)

    return {
      pid,
      port: processInfo.port,
      status: isRunning ? 'running' : 'stopped',
      startTime: processInfo.startTime,
      uptime: isRunning ? Date.now() - processInfo.startTime.getTime() : 0,
      recentLogs: processInfo.logs.slice(-50) // Last 50 log entries
    }
  }

  async getAllProcesses() {
    const processes = []

    for (const [pid, info] of this.processes) {
      const isRunning = await this.isProcessRunning(pid)
      processes.push({
        pid,
        projectPath: info.projectPath,
        port: info.port,
        status: isRunning ? 'running' : 'stopped',
        startTime: info.startTime
      })
    }

    return processes
  }

  async cleanup() {
    // Stop all running processes
    for (const [pid] of this.processes) {
      try {
        await this.stopProject(pid)
      } catch (error) {
        console.error(`Failed to stop process ${pid}:`, error)
      }
    }
  }
}