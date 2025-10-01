import { ProjectRepository } from '../../domain/interfaces/ProjectRepository.js'

/**
 * ProjectRepositoryAdapter
 * Infrastructure adapter that implements ProjectRepository interface
 */
export class ProjectRepositoryAdapter extends ProjectRepository {
  constructor(apiClient) {
    super()
    this._apiClient = apiClient
  }

  /**
   * Get API client for direct access
   * @returns {Object}
   */
  get apiClient() {
    return this._apiClient
  }

  /**
   * Get all repositories
   * @returns {Promise<{repositories: Project[], currentWorkingDirectory: string}>}
   */
  async getRepositories() {
    try {
      const response = await this._apiClient.get('/api/project/repositories')
      const data = response.data.data || response.data
      return {
        repositories: data.repositories || [],
        currentWorkingDirectory: data.currentWorkingDirectory || null
      }
    } catch (error) {
      throw new Error(`Failed to fetch repositories: ${error.message}`)
    }
  }

  /**
   * Get current repository
   * @returns {Promise<Project|null>}
   */
  async getCurrentRepository() {
    try {
      const response = await this._apiClient.get('/api/project/current')
      const data = response.data.data || response.data
      return data.repository || null
    } catch (error) {
      // Return null if no current repository instead of throwing
      return null
    }
  }

  /**
   * Switch to repository
   * @param {string} repositoryPath
   * @returns {Promise<Project>}
   */
  async switchRepository(repositoryPath) {
    try {
      const response = await this._apiClient.post('/api/project/switch-repository', {
        repositoryPath
      })
      const data = response.data.data || response.data
      return data.repository || data
    } catch (error) {
      throw new Error(`Failed to switch repository: ${error.message}`)
    }
  }

  /**
   * Get project definition (hierarchical data for frontend)
   * @returns {Promise<{appDefinition: object, integrations: array, modules: array, git: object, structure: object, environment: object}>}
   */
  async getDefinition() {
    try {
      const response = await this._apiClient.get('/api/project/definition')
      const data = response.data.data || response.data
      return data
    } catch (error) {
      throw new Error(`Failed to get project definition: ${error.message}`)
    }
  }

  /**
   * Get project status
   * @returns {Promise<{status: string, environment: string}>}
   */
  async getStatus() {
    try {
      const response = await this._apiClient.get('/api/project/status')
      const data = response.data.data || response.data
      return {
        status: data.status || 'stopped',
        environment: data.environment || 'local'
      }
    } catch (error) {
      throw new Error(`Failed to fetch project status: ${error.message}`)
    }
  }

  /**
   * Start project
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async start(options = {}) {
    try {
      await this._apiClient.post('/api/project/start', options)
    } catch (error) {
      throw new Error(`Failed to start project: ${error.message}`)
    }
  }

  /**
   * Stop project
   * @param {boolean} force
   * @returns {Promise<void>}
   */
  async stop(force = false) {
    try {
      await this._apiClient.post('/api/project/stop', { force })
    } catch (error) {
      throw new Error(`Failed to stop project: ${error.message}`)
    }
  }

  /**
   * Restart project
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async restart(options = {}) {
    try {
      await this._apiClient.post('/api/project/restart', options)
    } catch (error) {
      throw new Error(`Failed to restart project: ${error.message}`)
    }
  }

  /**
   * Get project logs
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async getLogs(limit = 100) {
    try {
      const response = await this._apiClient.get(`/api/project/logs?limit=${limit}`)
      const data = response.data.data || response.data
      return data.logs || []
    } catch (error) {
      throw new Error(`Failed to fetch project logs: ${error.message}`)
    }
  }

  /**
   * Get project metrics
   * @returns {Promise<Object>}
   */
  async getMetrics() {
    try {
      const response = await this._apiClient.get('/api/project/metrics')
      const data = response.data.data || response.data
      return data || {}
    } catch (error) {
      throw new Error(`Failed to fetch project metrics: ${error.message}`)
    }
  }
}