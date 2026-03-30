/**
 * Get Git Branches Use Case
 * Retrieves all git branches for a project
 */

export class GetGitBranchesUseCase {
  constructor({ gitAdapter }) {
    this.gitAdapter = gitAdapter
  }

  /**
   * Execute the use case
   * @param {Object} params
   * @param {string} params.projectPath - The project path
   * @returns {Promise<{current: string, branches: Array}>}
   */
  async execute({ projectPath }) {
    if (!projectPath) {
      throw new Error('Project path is required')
    }

    // Get current branch
    const currentBranch = await this.gitAdapter.getCurrentBranch(projectPath)

    // Get all branches
    const branches = await this.gitAdapter.getAllBranches(projectPath)

    return {
      current: currentBranch,
      branches
    }
  }
}

export default GetGitBranchesUseCase
