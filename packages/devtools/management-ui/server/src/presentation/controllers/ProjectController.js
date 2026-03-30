import path from 'path'

/**
 * Controller for project management endpoints
 * Handles starting/stopping the Frigg project
 *
 * DDD: Controller is a thin adapter - all business logic delegated to use cases
 */
export class ProjectController {
  constructor({
    projectService,
    inspectProjectUseCase,
    gitService,
    findProjectByIdUseCase,
    listRepositoriesUseCase,
    switchRepositoryUseCase,
    getGitBranchesUseCase,
    switchGitBranchUseCase,
    listAvailableIDEsUseCase,
    openInIDEUseCase
  }) {
    this.projectService = projectService
    this.inspectProjectUseCase = inspectProjectUseCase
    this.gitService = gitService
    this.findProjectByIdUseCase = findProjectByIdUseCase
    this.listRepositoriesUseCase = listRepositoriesUseCase
    this.switchRepositoryUseCase = switchRepositoryUseCase
    this.getGitBranchesUseCase = getGitBranchesUseCase
    this.switchGitBranchUseCase = switchGitBranchUseCase
    this.listAvailableIDEsUseCase = listAvailableIDEsUseCase
    this.openInIDEUseCase = openInIDEUseCase
  }

  /**
   * Helper: Find project path by deterministic ID
   * @private
   */
  async _findProjectPathById(id) {
    const result = await this.findProjectByIdUseCase.execute({ id })
    return result?.path || null
  }

  /**
   * Get available repositories from CLI discovery
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  async getRepositories(req, res, next) {
    try {
      // DDD: Delegate to use case
      const result = await this.listRepositoriesUseCase.execute()

      console.log(`Found ${result.count} repositories with @friggframework/core v2+`)

      res.json({
        success: true,
        data: result
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

      // DDD: Delegate to use case
      const result = await this.switchRepositoryUseCase.execute({ repositoryPath })

      // Update the app locals so other endpoints use the new path
      req.app.locals.projectPath = repositoryPath

      console.log(`Switched to repository: ${result.repository.name} at ${repositoryPath}`)

      res.json({
        success: true,
        data: result
      })
    } catch (error) {
      // Map domain errors to HTTP status codes
      if (error.message === 'Repository not found') {
        return res.status(404).json({
          success: false,
          error: error.message
        })
      }
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

      // DDD: Delegate to use case
      const result = await this.getGitBranchesUseCase.execute({ projectPath })

      res.json({
        success: true,
        data: result
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

      // DDD: Delegate to use case
      const result = await this.switchGitBranchUseCase.execute({
        projectPath,
        branchName: name,
        create,
        force
      })

      res.json({
        success: true,
        data: result
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
      // DDD: Delegate to use case
      const result = await this.listAvailableIDEsUseCase.execute()

      res.json({
        success: true,
        data: result
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

      // DDD: Delegate to use case
      const result = await this.openInIDEUseCase.execute({
        filePath,
        ide,
        command
      })

      res.json({
        success: true,
        data: result
      })
    } catch (error) {
      // Map domain errors to HTTP status codes
      if (error.message?.includes('is not supported')) {
        return res.status(400).json({
          success: false,
          error: error.message
        })
      }
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