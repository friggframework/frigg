/**
 * List Repositories Use Case
 * Lists all available Frigg repositories with their deterministic IDs
 */

import { ProjectId } from '../../../domain/value-objects/ProjectId.js'

export class ListRepositoriesUseCase {
  constructor({ projectRepository }) {
    this.projectRepository = projectRepository
  }

  /**
   * Execute the use case
   * @returns {Promise<{repositories: Array, currentWorkingDirectory: string, count: number}>}
   */
  async execute() {
    // Get all available repositories from the repository layer
    const repositories = await this.projectRepository.getAvailableRepositories()
    const currentWorkingDirectory = await this.projectRepository.getCurrentWorkingDirectory()

    // Add deterministic IDs to each repository
    const repositoriesWithIds = repositories.map(repo => ({
      ...repo,
      id: ProjectId.generate(repo.path)
    }))

    return {
      repositories: repositoriesWithIds,
      currentWorkingDirectory,
      count: repositoriesWithIds.length
    }
  }
}

export default ListRepositoriesUseCase
