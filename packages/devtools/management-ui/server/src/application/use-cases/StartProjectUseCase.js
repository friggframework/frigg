import { existsSync } from 'fs'
import { resolve, basename } from 'path'
import { ProcessConflictError } from '../../domain/errors/ProcessConflictError.js'

/**
 * StartProjectUseCase - Start a Frigg project and manage its lifecycle
 *
 * Business Logic:
 * 1. Validate repository path exists
 * 2. Find backend directory (smart detection)
 * 3. Check if a process is already running
 * 4. Spawn the Frigg process
 * 5. Capture PID and detect port
 * 6. Stream logs via WebSocket
 * 7. Return complete status
 */
export class StartProjectUseCase {
  constructor({ processManager, webSocketService }) {
    this.processManager = processManager
    this.webSocketService = webSocketService
  }

  /**
   * Validate that we can find a valid backend directory
   * @param {string} repositoryPath - Path to validate
   * @returns {string} - Path to backend directory
   */
  validateBackendPath(repositoryPath) {
    const absolutePath = resolve(repositoryPath)

    // Check if we're already in a backend directory
    const currentInfra = resolve(absolutePath, 'infrastructure.js')
    if (existsSync(currentInfra)) {
      return absolutePath // Already in backend
    }

    // Check if path ends with 'backend'
    if (basename(absolutePath) === 'backend') {
      const infraPath = resolve(absolutePath, 'infrastructure.js')
      if (existsSync(infraPath)) {
        return absolutePath
      }
    }

    // Check for backend subdirectory
    const backendSubdir = resolve(absolutePath, 'backend')
    if (existsSync(backendSubdir)) {
      const backendInfra = resolve(backendSubdir, 'infrastructure.js')
      if (existsSync(backendInfra)) {
        return backendSubdir
      }
    }

    // No valid backend found
    throw new Error(
      `No valid Frigg backend found. Checked:\n` +
      `  - ${absolutePath}/infrastructure.js\n` +
      `  - ${backendSubdir}/infrastructure.js\n` +
      `A Frigg backend must contain an infrastructure.js file.`
    )
  }

  /**
   * Execute the use case
   * @param {string} projectIdOrPath - Project ID or path to Frigg repository
   * @param {object} options - Startup options (port, env)
   * @returns {Promise<object>} - Process status
   */
  async execute(projectIdOrPath, options = {}) {
    // 1. Resolve project ID to path if needed
    if (!projectIdOrPath) {
      throw new Error('Project ID or path is required')
    }

    let repositoryPath = projectIdOrPath

    // If it looks like an ID (8 hex chars), resolve it to a path
    if (/^[a-f0-9]{8}$/.test(projectIdOrPath)) {
      // Find the project path from available repositories
      const availableReposEnv = process.env.AVAILABLE_REPOSITORIES
      if (availableReposEnv) {
        try {
          const repositories = JSON.parse(availableReposEnv)
          const { ProjectId } = await import('../../domain/value-objects/ProjectId.js')

          for (const repo of repositories) {
            const repoId = ProjectId.generate(repo.path)
            if (repoId === projectIdOrPath) {
              repositoryPath = repo.path
              break
            }
          }
        } catch (error) {
          throw new Error(`Failed to resolve project ID: ${error.message}`)
        }
      }

      // If we still don't have a path, the project wasn't found
      if (repositoryPath === projectIdOrPath) {
        throw new Error(`Project with ID "${projectIdOrPath}" not found`)
      }
    }

    // 2. Validate repository path
    const absolutePath = resolve(repositoryPath)
    if (!existsSync(absolutePath)) {
      throw new Error(`Repository path does not exist: ${absolutePath}`)
    }

    // 2. Find and validate backend directory
    try {
      this.validateBackendPath(absolutePath)
    } catch (error) {
      throw error
    }

    // 3. Check if already running
    if (this.processManager.isRunning()) {
      const currentStatus = this.processManager.getStatus()
      throw new ProcessConflictError(
        `A Frigg process is already running (PID: ${currentStatus.pid}, Port: ${currentStatus.port})`,
        {
          pid: currentStatus.pid,
          port: currentStatus.port
        }
      )
    }

    // 4. Start the process
    try {
      const status = await this.processManager.start(absolutePath, this.webSocketService, options)

      return {
        success: true,
        ...status,
        message: 'Frigg project started successfully'
      }
    } catch (error) {
      throw new Error(`Failed to start Frigg project: ${error.message}`)
    }
  }
}
