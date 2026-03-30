import { GetProjectStatusUseCase } from '../use-cases/GetProjectStatusUseCase.js'
import { StartProjectUseCase } from '../use-cases/StartProjectUseCase.js'
import { StopProjectUseCase } from '../use-cases/StopProjectUseCase.js'
import { SwitchRepositoryUseCase } from '../use-cases/SwitchRepositoryUseCase.js'

/**
 * ProjectService
 * Application service that orchestrates project-related operations
 */
export class ProjectService {
  constructor(projectRepository) {
    this.projectRepository = projectRepository

    // Initialize use cases
    this.getProjectStatusUseCase = new GetProjectStatusUseCase(projectRepository)
    this.startProjectUseCase = new StartProjectUseCase(projectRepository)
    this.stopProjectUseCase = new StopProjectUseCase(projectRepository)
    this.switchRepositoryUseCase = new SwitchRepositoryUseCase(projectRepository)
  }

  /**
   * Get all repositories
   * @returns {Promise<{repositories: Project[], currentWorkingDirectory: string}>}
   */
  async getRepositories() {
    return this.projectRepository.getRepositories()
  }

  /**
   * Get current repository
   * @returns {Promise<Project|null>}
   */
  async getCurrentRepository() {
    return this.projectRepository.getCurrentRepository()
  }

  /**
   * Switch repository
   * @param {string} repositoryPath
   * @returns {Promise<Project>}
   */
  async switchRepository(repositoryPath) {
    return this.switchRepositoryUseCase.execute(repositoryPath)
  }

  /**
   * Get project definition (hierarchical data for frontend)
   * @returns {Promise<{appDefinition: object, integrations: array, modules: array, git: object, structure: object, environment: object}>}
   */
  async getDefinition() {
    return this.projectRepository.getDefinition()
  }

  /**
   * Get project status
   * @returns {Promise<{status: ServiceStatus, environment: string}>}
   */
  async getStatus() {
    return this.getProjectStatusUseCase.execute()
  }

  /**
   * Start project
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async start(options = {}) {
    return this.startProjectUseCase.execute(options)
  }

  /**
   * Stop project
   * @param {boolean} force
   * @returns {Promise<void>}
   */
  async stop(force = false) {
    return this.stopProjectUseCase.execute(force)
  }

  /**
   * Restart project
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async restart(options = {}) {
    try {
      await this.stopProjectUseCase.execute(false)
      await this.startProjectUseCase.execute(options)
    } catch (error) {
      console.error('Error restarting project:', error)
      throw new Error('Failed to restart project')
    }
  }

  /**
   * Get project logs
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async getLogs(limit = 100) {
    if (typeof limit !== 'number' || limit < 1) {
      throw new Error('Limit must be a positive number')
    }
    return this.projectRepository.getLogs(limit)
  }

  /**
   * Get project metrics
   * @returns {Promise<Object>}
   */
  async getMetrics() {
    return this.projectRepository.getMetrics()
  }

  /**
   * Get API client for direct API access
   * @returns {Object}
   */
  get apiClient() {
    return this.projectRepository.apiClient
  }
}