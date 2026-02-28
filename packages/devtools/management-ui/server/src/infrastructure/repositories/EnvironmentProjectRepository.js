/**
 * Environment Project Repository
 * Retrieves repository information from environment variables and CLI discovery
 */

import { createRequire } from 'node:module'

export class EnvironmentProjectRepository {
  constructor({ projectPath = process.cwd() } = {}) {
    this.projectPath = projectPath
    this.require = createRequire(import.meta.url)
  }

  /**
   * Get all available Frigg repositories from environment or discovery
   * @returns {Promise<Array>} List of repositories
   */
  async getAvailableRepositories() {
    // First try environment variable
    const availableReposEnv = process.env.AVAILABLE_REPOSITORIES
    let repositories = []

    if (availableReposEnv) {
      try {
        const parsed = JSON.parse(availableReposEnv)
        repositories = Array.isArray(parsed) ? parsed : []
      } catch (error) {
        console.error('Error parsing AVAILABLE_REPOSITORIES:', error)
      }
    }

    // If no repositories from env, try discovery
    if (!repositories || repositories.length === 0) {
      try {
        const { discoverFriggRepositories } = this.require('../../../../../frigg-cli/utils/repo-detection')
        repositories = await discoverFriggRepositories()
      } catch (error) {
        console.warn('Repository discovery failed:', error.message)
        repositories = []
      }
    }

    return repositories
  }

  /**
   * Get current working directory
   * @returns {Promise<string>}
   */
  async getCurrentWorkingDirectory() {
    const repositoryInfoEnv = process.env.REPOSITORY_INFO

    if (repositoryInfoEnv) {
      try {
        const repoInfo = JSON.parse(repositoryInfoEnv)
        return repoInfo.path || process.cwd()
      } catch {
        // Fall through to default
      }
    }

    return process.cwd()
  }

  /**
   * Set current working directory
   * @param {string} path
   */
  async setCurrentWorkingDirectory(path) {
    process.env.PROJECT_ROOT = path
    this.projectPath = path
  }
}

export default EnvironmentProjectRepository
