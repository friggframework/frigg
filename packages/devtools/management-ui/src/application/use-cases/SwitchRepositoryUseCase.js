import { Project } from '../../domain/entities/Project.js'

/**
 * SwitchRepositoryUseCase
 * Orchestrates switching to a different repository
 */
export class SwitchRepositoryUseCase {
  constructor(projectRepository) {
    this.projectRepository = projectRepository
  }

  /**
   * Execute the use case
   * @param {string} repositoryPath
   * @returns {Promise<Project>}
   */
  async execute(repositoryPath) {
    if (!repositoryPath || typeof repositoryPath !== 'string') {
      throw new Error('Repository path is required and must be a string')
    }

    try {
      // Validate path format (basic validation)
      if (!this.isValidPath(repositoryPath)) {
        throw new Error('Invalid repository path format')
      }

      // Switch to the repository
      const projectData = await this.projectRepository.switchRepository(repositoryPath)
      const project = Project.fromObject(projectData)

      return project
    } catch (error) {
      throw new Error(`Failed to switch repository: ${error.message}`)
    }
  }

  /**
   * Basic path validation
   * @param {string} path
   * @returns {boolean}
   */
  isValidPath(path) {
    // Basic validation - path should not be empty and should be absolute
    return path.length > 0 && (path.startsWith('/') || /^[A-Za-z]:\\/.test(path))
  }
}