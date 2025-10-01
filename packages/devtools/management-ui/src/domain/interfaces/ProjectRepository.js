/**
 * ProjectRepository Interface (Port)
 * Defines the contract for project data access
 */
export class ProjectRepository {
  /**
   * Get all repositories
   * @returns {Promise<{repositories: Project[], currentWorkingDirectory: string}>}
   */
  async getRepositories() {
    throw new Error('Method getRepositories must be implemented')
  }

  /**
   * Get current repository
   * @returns {Promise<Project|null>}
   */
  async getCurrentRepository() {
    throw new Error('Method getCurrentRepository must be implemented')
  }

  /**
   * Switch to repository
   * @param {string} repositoryPath
   * @returns {Promise<Project>}
   */
  async switchRepository(repositoryPath) {
    throw new Error('Method switchRepository must be implemented')
  }

  /**
   * Get project status
   * @returns {Promise<{status: string, environment: string}>}
   */
  async getStatus() {
    throw new Error('Method getStatus must be implemented')
  }

  /**
   * Start project
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async start(options = {}) {
    throw new Error('Method start must be implemented')
  }

  /**
   * Stop project
   * @param {boolean} force
   * @returns {Promise<void>}
   */
  async stop(force = false) {
    throw new Error('Method stop must be implemented')
  }

  /**
   * Restart project
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async restart(options = {}) {
    throw new Error('Method restart must be implemented')
  }

  /**
   * Get project logs
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async getLogs(limit = 100) {
    throw new Error('Method getLogs must be implemented')
  }

  /**
   * Get project metrics
   * @returns {Promise<Object>}
   */
  async getMetrics() {
    throw new Error('Method getMetrics must be implemented')
  }
}