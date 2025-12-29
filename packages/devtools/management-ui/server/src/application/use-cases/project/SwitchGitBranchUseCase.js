/**
 * Switch Git Branch Use Case
 * Switches to a different git branch, optionally creating it
 */

export class SwitchGitBranchUseCase {
  constructor({ gitAdapter }) {
    this.gitAdapter = gitAdapter
  }

  /**
   * Execute the use case
   * @param {Object} params
   * @param {string} params.projectPath - The project path
   * @param {string} params.branchName - The branch name to switch to
   * @param {boolean} params.create - Whether to create the branch if it doesn't exist
   * @param {boolean} params.force - Whether to force the checkout
   * @returns {Promise<{name: string, headCommit: string, dirty: boolean}>}
   */
  async execute({ projectPath, branchName, create = false, force = false }) {
    if (!projectPath) {
      throw new Error('Project path is required')
    }

    if (!branchName) {
      throw new Error('Branch name is required')
    }

    // Switch the branch
    await this.gitAdapter.checkout(projectPath, branchName, { create, force })

    // Get the new state
    const headCommit = await this.gitAdapter.getHeadCommit(projectPath)
    const isDirty = await this.gitAdapter.isDirty(projectPath)

    return {
      name: branchName,
      headCommit,
      dirty: isDirty
    }
  }
}

export default SwitchGitBranchUseCase
