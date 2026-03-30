/**
 * Switch Repository Use Case
 * Switches the active repository context
 */

export class SwitchRepositoryUseCase {
  constructor({ projectRepository }) {
    this.projectRepository = projectRepository
  }

  /**
   * Execute the use case
   * @param {Object} params
   * @param {string} params.repositoryPath - The path to switch to
   * @returns {Promise<{repository: Object, message: string}>}
   */
  async execute({ repositoryPath }) {
    if (!repositoryPath) {
      throw new Error('Repository path is required')
    }

    // Get all available repositories
    const repositories = await this.projectRepository.getAvailableRepositories()

    // Find the repository
    const selectedRepo = repositories.find(repo => repo.path === repositoryPath)

    if (!selectedRepo) {
      throw new Error('Repository not found')
    }

    // Update the current working directory
    await this.projectRepository.setCurrentWorkingDirectory(repositoryPath)

    return {
      repository: selectedRepo,
      message: `Switched to repository: ${selectedRepo.name}`
    }
  }
}

export default SwitchRepositoryUseCase
