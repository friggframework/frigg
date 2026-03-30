/**
 * Find Project By ID Use Case
 * Resolves a deterministic project ID to its file system path
 *
 * Supports resolution by:
 * 1. Repository path ID (primary)
 * 2. Explicit backendPath ID if provided
 * 3. Derived backend path ID (repo.path + '/backend') for workspace projects
 * 4. Derived root path ID (parent of repo.path) for repos with backend structure
 */

import { ProjectId } from '../../../domain/value-objects/ProjectId.js'

export class FindProjectByIdUseCase {
  constructor({ projectRepository }) {
    this.projectRepository = projectRepository
  }

  /**
   * Execute the use case
   * @param {Object} params
   * @param {string} params.id - The deterministic project ID
   * @returns {Promise<{path: string, repository: Object}|null>} The project path and info, or null if not found
   */
  async execute({ id }) {
    if (!id) {
      throw new Error('Project ID is required')
    }

    // Get all available repositories
    const repositories = await this.projectRepository.getAvailableRepositories()

    // First pass: Check for exact path ID match
    for (const repo of repositories) {
      const repoId = ProjectId.generate(repo.path)
      if (repoId === id) {
        return {
          path: repo.path,
          repository: repo
        }
      }
    }

    // Second pass: Check for explicit backendPath ID match
    for (const repo of repositories) {
      if (repo.backendPath) {
        const backendId = ProjectId.generate(repo.backendPath)
        if (backendId === id) {
          return {
            path: repo.backendPath,
            repository: repo
          }
        }
      }
    }

    // Third pass: Derive and check backend path for repos that have backend
    // This handles workspace projects where repo.path is root but ID is from backend
    for (const repo of repositories) {
      if (repo.hasBackend && !repo.path.endsWith('/backend')) {
        const derivedBackendPath = repo.path + '/backend'
        const derivedBackendId = ProjectId.generate(derivedBackendPath)
        if (derivedBackendId === id) {
          return {
            path: derivedBackendPath,
            repository: repo
          }
        }
      }
    }

    // Fourth pass: Check if repo.path ends with /backend, try parent (root) ID
    // This handles cases where discovery already set path to backend
    // but frontend has an ID from root path
    for (const repo of repositories) {
      if (repo.path.endsWith('/backend')) {
        const rootPath = repo.path.slice(0, -8) // Remove '/backend'
        const rootId = ProjectId.generate(rootPath)
        if (rootId === id) {
          return {
            path: rootPath,
            repository: repo
          }
        }
      }
    }

    return null
  }
}

export default FindProjectByIdUseCase
