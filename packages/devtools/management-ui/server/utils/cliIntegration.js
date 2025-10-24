import { spawn } from 'child_process'
import path from 'path'

/**
 * Utility to integrate with Frigg CLI commands
 */
class FriggCLIIntegration {
  constructor() {
    this.cliPath = this.findCLIPath()
  }

  /**
   * Find the Frigg CLI executable path
   */
  findCLIPath() {
    // Try to find the CLI in the project structure
    const possiblePaths = [
      path.resolve(process.cwd(), '../frigg-cli/index.js'),
      path.resolve(process.cwd(), '../../frigg-cli/index.js'),
      path.resolve(process.cwd(), 'packages/devtools/frigg-cli/index.js'),
      'frigg' // Global installation
    ]

    // For now, we'll use the relative path within the project
    return path.resolve(process.cwd(), '../frigg-cli/index.js')
  }

  /**
   * Execute a Frigg CLI command
   */
  async executeCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const childProcess = spawn('node', [this.cliPath, command, ...args], {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
        stdio: options.stdio || 'pipe'
      })

      let stdout = ''
      let stderr = ''

      if (childProcess.stdout) {
        childProcess.stdout.on('data', (data) => {
          stdout += data.toString()
        })
      }

      if (childProcess.stderr) {
        childProcess.stderr.on('data', (data) => {
          stderr += data.toString()
        })
      }

      childProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, code })
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`))
        }
      })

      childProcess.on('error', (error) => {
        reject(error)
      })
    })
  }

  /**
   * Install an integration using CLI
   */
  async installIntegration(integrationName, options = {}) {
    const args = [integrationName]
    
    if (options.verbose) {
      args.push('--verbose')
    }

    return this.executeCommand('install', args, options)
  }

  /**
   * Build the project using CLI
   */
  async buildProject(options = {}) {
    const args = []
    
    if (options.stage) {
      args.push('--stage', options.stage)
    }
    
    if (options.verbose) {
      args.push('--verbose')
    }

    return this.executeCommand('build', args, options)
  }

  /**
   * Deploy the project using CLI
   */
  async deployProject(options = {}) {
    const args = []
    
    if (options.stage) {
      args.push('--stage', options.stage)
    }
    
    if (options.verbose) {
      args.push('--verbose')
    }

    return this.executeCommand('deploy', args, options)
  }

  /**
   * Initialize a new project using CLI
   */
  async initProject(projectDirectory, options = {}) {
    const args = [projectDirectory]
    
    if (options.template) {
      args.push('--template', options.template)
    }
    
    if (options.verbose) {
      args.push('--verbose')
    }

    return this.executeCommand('init', args, options)
  }

  /**
   * Create a new integration using CLI
   */
  async createIntegration(integrationName, options = {}) {
    const args = integrationName ? [integrationName] : []

    return this.executeCommand('create', args, options)
  }

  /**
   * Generate IAM template using CLI
   */
  async generateIAM(options = {}) {
    const args = []
    
    if (options.output) {
      args.push('--output', options.output)
    }
    
    if (options.user) {
      args.push('--user', options.user)
    }
    
    if (options.stackName) {
      args.push('--stack-name', options.stackName)
    }
    
    if (options.verbose) {
      args.push('--verbose')
    }

    return this.executeCommand('generate-iam', args, options)
  }

  /**
   * Launch the management UI using CLI
   */
  async launchUI(options = {}) {
    const args = []
    
    if (options.port) {
      args.push('--port', options.port)
    }
    
    if (options.apiPort) {
      args.push('--api-port', options.apiPort)
    }
    
    if (options.noBrowser) {
      args.push('--no-browser')
    }
    
    if (options.uiOnly) {
      args.push('--ui-only')
    }

    return this.executeCommand('ui', args, options)
  }

  /**
   * Get CLI version and help information
   */
  async getInfo() {
    try {
      const result = await this.executeCommand('--help')
      return result.stdout
    } catch (error) {
      console.warn('Could not get CLI info:', error.message)
      return null
    }
  }

  /**
   * Validate CLI is available
   */
  async validateCLI() {
    try {
      await this.getInfo()
      return true
    } catch (error) {
      return false
    }
  }
}

// Create singleton instance
const cliIntegration = new FriggCLIIntegration()

export default cliIntegration