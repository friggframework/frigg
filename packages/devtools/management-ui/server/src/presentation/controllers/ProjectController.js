import { createRequire } from 'node:module'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import { exec } from 'child_process'
import { ProjectId } from '../../domain/value-objects/ProjectId.js'

const require = createRequire(import.meta.url)
const execAsync = promisify(exec)

/**
 * Controller for project management endpoints
 * Handles starting/stopping the Frigg project
 */
export class ProjectController {
  constructor({ projectService, inspectProjectUseCase, gitService }) {
    this.projectService = projectService
    this.inspectProjectUseCase = inspectProjectUseCase
    this.gitService = gitService
  }

  /**
   * Helper: Find project path by deterministic ID
   * @private
   */
  async _findProjectPathById(id) {
    // Get all available repositories
    const availableReposEnv = process.env.AVAILABLE_REPOSITORIES
    let repositories = []

    if (availableReposEnv) {
      try {
        repositories = JSON.parse(availableReposEnv)
      } catch (error) {
        console.error('Error parsing AVAILABLE_REPOSITORIES:', error)
        throw new Error('Failed to load available repositories')
      }
    }

    // Find the repository with matching ID
    for (const repo of repositories) {
      const repoId = ProjectId.generate(repo.path)
      if (repoId === id) {
        return repo.path
      }
    }

    return null
  }

  /**
   * Get available repositories from CLI discovery
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  async getRepositories(req, res, next) {
    try {
      // Get repositories from environment variable set by CLI
      const availableReposEnv = process.env.AVAILABLE_REPOSITORIES
      const repositoryInfoEnv = process.env.REPOSITORY_INFO

      let repositories = []
      let currentWorkingDirectory = process.cwd()

      if (availableReposEnv) {
        try {
          repositories = JSON.parse(availableReposEnv)
        } catch (error) {
          console.error('Error parsing AVAILABLE_REPOSITORIES:', error)
        }
      }

      // If no repositories from env, try to discover them via CLI
      if (repositories.length === 0) {
        console.log('No repositories from env, attempting CLI discovery...')
        try {
          const { exec } = await import('child_process')
          const { promisify } = await import('util')
          const execAsync = promisify(exec)
          const path = await import('path')

          const friggPath = path.join(process.cwd(), '../../frigg-cli/index.js')
          const command = `node "${friggPath}" repos list --json`

          const { stdout } = await execAsync(command, {
            cwd: process.cwd(),
            maxBuffer: 1024 * 1024 * 10
          })

          repositories = JSON.parse(stdout)
          console.log(`Discovered ${repositories.length} repositories via CLI`)
        } catch (error) {
          console.warn('CLI discovery failed:', error.message)
          // Continue with empty array - frontend will handle
        }
      }

      if (repositoryInfoEnv) {
        try {
          const repoInfo = JSON.parse(repositoryInfoEnv)
          currentWorkingDirectory = repoInfo.path || process.cwd()
        } catch (error) {
          console.error('Error parsing REPOSITORY_INFO:', error)
        }
      }

      // Add deterministic IDs to each repository
      const repositoriesWithIds = repositories.map(repo => ({
        ...repo,
        id: ProjectId.generate(repo.path)
      }))

      console.log(`Found ${repositoriesWithIds.length} repositories with @friggframework/core v2+`)

      res.json({
        success: true,
        data: {
          repositories: repositoriesWithIds,
          currentWorkingDirectory,
          count: repositoriesWithIds.length
        }
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get project by deterministic ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  async getProjectById(req, res, next) {
    try {
      const { id } = req.params

      // Find the project path
      const projectPath = await this._findProjectPathById(id)

      if (!projectPath) {
        return res.status(404).json({
          success: false,
          error: 'Project not found'
        })
      }

      // Get project details using inspection
      const inspection = await this.inspectProjectUseCase.execute({ projectPath })

      // Get runtime status
      const status = await this.projectService.getStatus(projectPath)

      // Get git status using domain service
      let gitStatus
      try {
        gitStatus = await this.gitService.getStatus(projectPath)
      } catch (error) {
        console.warn('Failed to get git status:', error.message)
        gitStatus = {
          currentBranch: 'unknown',
          status: { staged: 0, unstaged: 0, untracked: 0 }
        }
      }

      // Nest integrations inside appDefinition for cleaner structure
      const appDef = inspection.appDefinition || {}
      if (!appDef.integrations && inspection.integrations) {
        appDef.integrations = inspection.integrations
      }

      // Format response according to API spec (camelCase)
      res.json({
        success: true,
        data: {
          id,
          name: path.basename(projectPath),
          path: projectPath,
          appDefinition: appDef,
          apiModules: inspection.modules || [],
          git: gitStatus,
          friggStatus: {
            running: status.isRunning || false,
            executionId: status.runtimeInfo?.executionId || null,
            port: status.runtimeInfo?.port || null
          }
        }
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * Switch to a different repository
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  async switchRepository(req, res, next) {
    try {
      const { repositoryPath } = req.body

      if (!repositoryPath) {
        return res.status(400).json({
          success: false,
          error: 'Repository path is required'
        })
      }

      // Find the repository in the available repositories
      const availableReposEnv = process.env.AVAILABLE_REPOSITORIES
      let repositories = []

      if (availableReposEnv) {
        try {
          repositories = JSON.parse(availableReposEnv)
        } catch (error) {
          console.error('Error parsing AVAILABLE_REPOSITORIES:', error)
        }
      }

      const selectedRepo = repositories.find(repo => repo.path === repositoryPath)

      if (!selectedRepo) {
        return res.status(404).json({
          success: false,
          error: 'Repository not found'
        })
      }

      // Update the current working directory environment variable
      process.env.PROJECT_ROOT = repositoryPath

      // Update the app locals so other endpoints use the new path
      req.app.locals.projectPath = repositoryPath

      console.log(`Switched to repository: ${selectedRepo.name} at ${repositoryPath}`)

      res.json({
        success: true,
        data: {
          repository: selectedRepo,
          message: `Switched to repository: ${selectedRepo.name}`
        }
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get git branches for a project
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  async getGitBranches(req, res, next) {
    try {
      const { id } = req.params
      const projectPath = await this._findProjectPathById(id)

      if (!projectPath) {
        return res.status(404).json({
          success: false,
          error: 'Project not found'
        })
      }

      // Get current branch
      const currentResult = await execAsync('git branch --show-current', { cwd: projectPath })
      const currentBranch = currentResult.stdout.trim()

      // Get all branches
      const branchesResult = await execAsync('git branch -a', { cwd: projectPath })
      const branchLines = branchesResult.stdout.split('\n').filter(line => line.trim())

      const branches = branchLines.map(line => {
        const isRemote = line.includes('remotes/')
        const isCurrent = line.startsWith('*')
        const name = line.replace('*', '').trim().replace('remotes/', '')

        return {
          name: name.replace('origin/', ''),
          type: isRemote ? 'remote' : 'local',
          isCurrent,
          tracking: isRemote ? null : name
        }
      })

      res.json({
        success: true,
        data: {
          current: currentBranch,
          branches
        }
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get git status for a project
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  async getGitStatus(req, res, next) {
    try {
      const { id } = req.params
      const projectPath = await this._findProjectPathById(id)

      if (!projectPath) {
        return res.status(404).json({
          success: false,
          error: 'Project not found'
        })
      }

      // Use domain Git service for detailed status
      const status = await this.gitService.getDetailedStatus(projectPath)

      res.json({
        success: true,
        data: status
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * Switch git branch
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  async switchGitBranch(req, res, next) {
    try {
      const { id } = req.params
      const { name, create = false, force = false } = req.body

      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'Branch name is required'
        })
      }

      const projectPath = await this._findProjectPathById(id)

      if (!projectPath) {
        return res.status(404).json({
          success: false,
          error: 'Project not found'
        })
      }

      let command = 'git checkout'
      if (create) command += ' -b'
      if (force) command += ' -f'
      command += ` ${name}`

      await execAsync(command, { cwd: projectPath })

      // Get head commit
      const headResult = await execAsync('git rev-parse HEAD', { cwd: projectPath })
      const headCommit = headResult.stdout.trim()

      // Check if dirty
      const statusResult = await execAsync('git status --porcelain', { cwd: projectPath })
      const dirty = statusResult.stdout.trim().length > 0

      res.json({
        success: true,
        data: {
          name,
          headCommit,
          dirty
        }
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get project definition for frontend consumption
   * This is an alias for getProjectOverview with frontend-specific formatting
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  async getProjectDefinition(req, res, next) {
    try {
      // Use the same logic as getProjectOverview for now
      const projectPath = req.app.locals.projectPath || process.cwd()
      const overview = await this.inspectProjectUseCase.execute({ projectPath })

      res.json({
        success: true,
        data: {
          appDefinition: overview.appDefinition,
          integrations: overview.integrations,
          modules: overview.modules,
          git: overview.git,
          structure: overview.structure,
          environment: overview.environment,
          runtime: overview.runtime || null,
          isRunning: overview.appDefinition?.status === 'running'
        }
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get available IDEs
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  async getAvailableIDEs(req, res, next) {
    try {
      // For now, return a basic list of IDEs
      // In a real implementation, this would detect installed IDEs
      const ides = {
        cursor: { id: 'cursor', name: 'Cursor', available: true, category: 'popular' },
        vscode: { id: 'vscode', name: 'Visual Studio Code', available: true, category: 'popular' },
        webstorm: { id: 'webstorm', name: 'WebStorm', available: false, category: 'jetbrains' },
        intellij: { id: 'intellij', name: 'IntelliJ IDEA', available: false, category: 'jetbrains' },
        pycharm: { id: 'pycharm', name: 'PyCharm', available: false, category: 'jetbrains' },
        rider: { id: 'rider', name: 'JetBrains Rider', available: false, category: 'jetbrains' },
        android_studio: { id: 'android-studio', name: 'Android Studio', available: false, category: 'mobile' },
        sublime: { id: 'sublime', name: 'Sublime Text', available: false, category: 'other' },
        atom: { id: 'atom', name: 'Atom (Deprecated)', available: false, category: 'deprecated' },
        notepadpp: { id: 'notepadpp', name: 'Notepad++', available: false, category: 'windows' },
        xcode: { id: 'xcode', name: 'Xcode', available: false, category: 'apple' },
        eclipse: { id: 'eclipse', name: 'Eclipse IDE', available: false, category: 'java' },
        vim: { id: 'vim', name: 'Vim', available: false, category: 'terminal' },
        neovim: { id: 'neovim', name: 'Neovim', available: false, category: 'terminal' },
        emacs: { id: 'emacs', name: 'Emacs', available: false, category: 'terminal' },
        custom: { id: 'custom', name: 'Custom Command', available: true, category: 'other' }
      }

      res.json({
        success: true,
        data: { ides }
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * Check IDE availability
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  async checkIDEAvailability(req, res, next) {
    try {
      const { ideId } = req.params

      // For now, just return basic availability
      // In a real implementation, this would check if the IDE is installed
      const available = ideId === 'cursor' || ideId === 'vscode' || ideId === 'custom'

      res.json({
        success: true,
        data: {
          ide: ideId,
          available,
          reason: available ? 'IDE detected' : 'IDE not found'
        }
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * Open file in IDE
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  async openInIDE(req, res, next) {
    try {
      const { path: filePath, ide, command } = req.body

      if (!filePath) {
        return res.status(400).json({
          success: false,
          error: 'File path is required'
        })
      }

      if (!ide && !command) {
        return res.status(400).json({
          success: false,
          error: 'Either IDE or custom command is required'
        })
      }

      const { spawn, exec } = await import('child_process')
      const { platform } = await import('os')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      const currentPlatform = platform()

      // Find the git repository root to open the workspace instead of a single file
      let workspacePath = filePath
      let isGitRepo = false

      try {
        // Try to find git root from the file path
        const pathModule = await import('path')
        const fsModule = await import('fs')

        // Determine starting directory (if filePath is a file, use its directory)
        let searchDir = filePath
        if (fsModule.existsSync(filePath)) {
          const stats = fsModule.statSync(filePath)
          if (stats.isFile()) {
            searchDir = pathModule.dirname(filePath)
          }
        }

        // Try to get git root using git command
        const gitRootResult = await execAsync('git rev-parse --show-toplevel', {
          cwd: searchDir,
          timeout: 2000
        })

        if (gitRootResult.stdout) {
          workspacePath = gitRootResult.stdout.trim()
          isGitRepo = true
          console.log(`Found git repository root: ${workspacePath}`)
        }
      } catch (error) {
        // Not a git repo or git not available, fallback to original path
        console.log(`Not a git repository or git unavailable, opening path directly: ${filePath}`)
        workspacePath = filePath
      }

      // IDE configuration with URI schemes and app names
      const ideConfigs = {
        'cursor': {
          uriScheme: 'cursor',
          appName: 'Cursor',
          cli: {
            darwin: 'cursor',
            win32: 'cursor',
            linux: 'cursor'
          }
        },
        'vscode': {
          uriScheme: 'vscode',
          appName: 'Visual Studio Code',
          cli: {
            darwin: 'code',
            win32: 'code',
            linux: 'code'
          }
        },
        'windsurf': {
          uriScheme: 'windsurf',
          appName: 'Windsurf',
          cli: {
            darwin: 'windsurf',
            win32: 'windsurf',
            linux: 'windsurf'
          }
        },
        'webstorm': {
          appName: 'WebStorm',
          cli: {
            darwin: 'webstorm',
            win32: 'webstorm.bat',
            linux: 'webstorm'
          }
        },
        'intellij': {
          appName: 'IntelliJ IDEA',
          cli: {
            darwin: 'idea',
            win32: 'idea.bat',
            linux: 'idea'
          }
        },
        'pycharm': {
          appName: 'PyCharm',
          cli: {
            darwin: 'pycharm',
            win32: 'pycharm.bat',
            linux: 'pycharm'
          }
        },
        'sublime': {
          appName: 'Sublime Text',
          cli: {
            darwin: 'subl',
            win32: 'sublime_text',
            linux: 'subl'
          }
        },
        'xcode': {
          appName: 'Xcode',
          cli: {
            darwin: 'xed',
            win32: null,
            linux: null
          }
        }
      }

      let commandToRun
      let args = []
      let useURIScheme = false
      let useOpenCommand = false

      if (command) {
        // Use custom command
        const parts = command.split(' ')
        commandToRun = parts[0]
        args = [...parts.slice(1), workspacePath]
      } else {
        const ideConfig = ideConfigs[ide]

        if (!ideConfig) {
          return res.status(400).json({
            success: false,
            error: `IDE '${ide}' is not supported`
          })
        }

        // For macOS, use 'open -a AppName' to bring IDE to foreground
        if (currentPlatform === 'darwin' && ideConfig.appName) {
          useOpenCommand = true
          commandToRun = 'open'

          // For IDEs with CLI, use the CLI with open -a to bring to front
          if (ideConfig.cli.darwin) {
            // First, open the file with CLI
            // Then bring the app to foreground
            args = ['-a', ideConfig.appName, workspacePath]
          } else {
            args = ['-a', ideConfig.appName, workspacePath]
          }
        } else {
          // For other platforms, use CLI commands
          const cliCommand = ideConfig.cli[currentPlatform]

          if (!cliCommand) {
            return res.status(400).json({
              success: false,
              error: `IDE '${ide}' is not supported on ${currentPlatform}`
            })
          }

          commandToRun = cliCommand
          args = [workspacePath]
        }
      }

      console.log(`Opening in IDE: ${commandToRun} ${args.join(' ')}`)

      // Spawn the IDE process
      const childProcess = spawn(commandToRun, args, {
        detached: true,
        stdio: 'ignore',
        shell: currentPlatform === 'win32'
      })

      childProcess.unref()

      // Give the process a moment to start
      await new Promise(resolve => setTimeout(resolve, 100))

      res.json({
        success: true,
        data: {
          message: `Opening ${isGitRepo ? 'git repository' : 'path'} in ${ide || 'custom command'}`,
          path: workspacePath,
          originalPath: filePath,
          isGitRepo,
          ide: ide || 'custom',
          command: commandToRun,
          args,
          method: useURIScheme ? 'uri-scheme' : useOpenCommand ? 'open-command' : 'cli',
          pid: childProcess.pid
        }
      })
    } catch (error) {
      console.error('Failed to open in IDE:', error)
      next(error)
    }
  }

  /**
   * Get users
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  async getUsers(req, res, next) {
    try {
      // For now, return an empty array
      // In a real implementation, this would fetch users from a database
      res.json({
        success: true,
        data: []
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * Debug endpoint to test repository loading
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  async debugRepository(req, res, next) {
    try {
      const projectPath = req.app.locals.projectPath || process.cwd()

      // Test the inspectProjectUseCase directly
      const result = await this.inspectProjectUseCase.execute({ projectPath })

      res.json({
        success: true,
        data: {
          projectPath,
          result: result ? {
            appDefinition: result.appDefinition,
            integrations: result.integrations,
            modules: result.modules
          } : null
        }
      })
    } catch (error) {
      console.error('Debug error:', error)
      res.json({
        success: false,
        error: error.message,
        stack: error.stack
      })
    }
  }

  async getStatus(req, res, next) {
    try {
      const { id, executionId } = req.params

      // If ID is provided in params, find project path
      let projectPath
      if (id) {
        projectPath = await this._findProjectPathById(id)
        if (!projectPath) {
          return res.status(404).json({
            success: false,
            error: 'Project not found'
          })
        }
      } else {
        // Legacy endpoint without ID
        projectPath = req.app.locals.projectPath || process.cwd()
      }

      const status = await this.projectService.getStatus(projectPath)

      // Format response for new API structure if execution ID provided
      if (executionId) {
        const runtimeInfo = status.runtimeInfo || {}
        const startedAt = runtimeInfo.startedAt || new Date().toISOString()
        const uptimeSeconds = runtimeInfo.uptime
          ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
          : 0

        // Check if project is running - runtimeInfo exists only when running
        const isRunning = !!status.runtimeInfo && status.runtimeInfo.pid != null

        res.json({
          success: true,
          data: {
            executionId,
            running: isRunning,
            startedAt,
            uptimeSeconds,
            pid: runtimeInfo.pid,
            port: runtimeInfo.port || 3000,
            friggBaseUrl: `http://localhost:${runtimeInfo.port || 3000}`
          }
        })
      } else {
        // Legacy response format
        res.json({
          success: true,
          data: status
        })
      }
    } catch (error) {
      next(error)
    }
  }

  async startProject(req, res, next) {
    try {
      const { id } = req.params
      const { port: requestedPort, env = {} } = req.body

      // Validate env parameter - must be a plain object with string values
      if (env && typeof env === 'object') {
        for (const [key, value] of Object.entries(env)) {
          if (typeof value !== 'string') {
            return res.status(400).json({
              success: false,
              error: `Invalid env variable "${key}": expected string value, got ${typeof value}`
            })
          }
        }
      } else if (env !== undefined && env !== null) {
        return res.status(400).json({
          success: false,
          error: 'env parameter must be an object with string key-value pairs'
        })
      }

      // Validate port parameter
      if (requestedPort && (typeof requestedPort !== 'number' || requestedPort < 1 || requestedPort > 65535)) {
        return res.status(400).json({
          success: false,
          error: 'port parameter must be a number between 1 and 65535'
        })
      }

      // Pass the project ID (or null for legacy) - let the service layer handle path resolution
      const result = await this.projectService.startProject(id, { port: requestedPort, env })

      // result contains: { success, isRunning, status, pid, port, baseUrl, startTime, uptime, repositoryPath, message }
      // Generate execution ID using actual PID
      const executionId = result.pid?.toString() || `exec-${Date.now()}`
      const actualPort = result.port || requestedPort || 3000
      const startedAt = result.startTime || new Date().toISOString()

      res.json({
        success: true,
        message: result.message || 'Project started successfully',
        data: {
          executionId,
          pid: result.pid,
          startedAt,
          port: actualPort,
          friggBaseUrl: result.baseUrl || `http://localhost:${actualPort}`,
          websocketUrl: id
            ? `ws://localhost:8080/api/projects/${id}/frigg/executions/${executionId}/logs`
            : `ws://localhost:8080/logs`
        }
      })
    } catch (error) {
      // Handle ProcessConflictError specifically
      if (error.name === 'ProcessConflictError') {
        return res.status(409).json({
          success: false,
          error: error.message,
          conflict: true,
          existingProcess: error.existingProcess
        })
      }
      next(error)
    }
  }

  async stopProject(req, res, next) {
    try {
      const { id, executionId } = req.params

      // If ID is provided in params, find project path
      let projectPath
      if (id) {
        projectPath = await this._findProjectPathById(id)
        if (!projectPath) {
          return res.status(404).json({
            success: false,
            error: 'Project not found'
          })
        }
      } else {
        // Legacy endpoint without ID
        projectPath = req.app.locals.projectPath || process.cwd()
      }

      await this.projectService.stopProject(projectPath)

      // New API returns 204 No Content
      if (id && executionId) {
        res.status(204).send()
      } else {
        // Legacy response
        res.json({
          success: true,
          message: 'Project stopped successfully'
        })
      }
    } catch (error) {
      next(error)
    }
  }

  async restartProject(req, res, next) {
    try {
      const projectPath = req.app.locals.projectPath || process.cwd()
      const result = await this.projectService.restartProject(projectPath)

      res.json({
        success: true,
        message: 'Project restarted successfully',
        data: {
          project: result.project.toJSON(),
          process: result.processInfo
        }
      })
    } catch (error) {
      next(error)
    }
  }

  async getEnvironment(req, res, next) {
    try {
      const projectPath = req.app.locals.projectPath || process.cwd()
      const status = await this.projectService.getStatus(projectPath)

      // Get required environment variables
      const requiredVars = status.project.requiredEnvVars || []
      const environment = {}

      for (const varName of requiredVars) {
        environment[varName] = {
          required: true,
          configured: !!process.env[varName],
          value: process.env[varName] ? '[REDACTED]' : null
        }
      }

      res.json({
        success: true,
        data: {
          variables: environment,
          totalRequired: requiredVars.length,
          configured: Object.values(environment).filter(v => v.configured).length
        }
      })
    } catch (error) {
      next(error)
    }
  }

  async getLogs(req, res, next) {
    try {
      const projectPath = req.app.locals.projectPath || process.cwd()
      const { lines = 100 } = req.query

      const status = await this.projectService.getStatus(projectPath)

      if (!status.runtimeInfo) {
        return res.json({
          success: true,
          data: {
            logs: [],
            message: 'Project is not running'
          }
        })
      }

      const logs = status.runtimeInfo.recentLogs?.slice(-lines) || []

      res.json({
        success: true,
        data: {
          logs,
          totalLines: logs.length
        }
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * Discover Frigg projects in the filesystem
   * Searches parent and child directories for Frigg projects
   */
  async discoverProjects(req, res, next) {
    try {
      const { searchPath = process.cwd(), includeParent = true } = req.query

      const projects = await this.discoverProjectsUseCase.execute({
        searchPath,
        includeParent: includeParent === 'true' || includeParent === true
      })

      res.json({
        success: true,
        data: {
          projects,
          count: projects.length,
          currentPath: searchPath
        }
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * Deep inspection of a Frigg project
   * Returns complete nested structure: appDefinition → integrations → modules
   */
  async inspectProject(req, res, next) {
    try {
      const { projectPath = req.app.locals.projectPath || process.cwd() } = req.query

      const inspection = await this.inspectProjectUseCase.execute({
        projectPath
      })

      res.json({
        success: true,
        data: inspection
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get project overview with nested data
   * Combines status with inspection for complete view
   */
  async getProjectOverview(req, res, next) {
    try {
      const projectPath = req.app.locals.projectPath || process.cwd()

      // Get both status and inspection data
      const [status, inspection] = await Promise.all([
        this.projectService.getStatus(projectPath),
        this.inspectProjectUseCase.execute({ projectPath })
      ])

      res.json({
        success: true,
        data: {
          ...inspection,
          runtime: status.runtimeInfo || null,
          isRunning: status.isRunning || false
        }
      })
    } catch (error) {
      next(error)
    }
  }
}