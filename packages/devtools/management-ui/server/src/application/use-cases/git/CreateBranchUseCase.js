import { GitBranch } from '../../../domain/entities/GitBranch.js'

/**
 * Use case for creating a new Git branch
 * Follows Git best practices for branch naming and creation
 */
export class CreateBranchUseCase {
  constructor({ gitAdapter }) {
    this.gitAdapter = gitAdapter
  }

  async execute({ branchName, baseBranch, branchType, description }) {
    // If type and description provided, generate branch name
    let finalBranchName = branchName
    if (!branchName && branchType && description) {
      finalBranchName = GitBranch.suggestBranchName(branchType, description)
    }

    if (!finalBranchName) {
      throw new Error('Branch name is required')
    }

    // Get repository to determine base branch if not provided
    if (!baseBranch) {
      const repository = await this.gitAdapter.getRepository()
      baseBranch = repository.getBaseBranchForFeature()
    }

    // Check for uncommitted changes
    const status = await this.gitAdapter.getStatus()
    if (status.modified.length > 0 || status.added.length > 0 || status.deleted.length > 0) {
      throw new Error('Please commit or stash your changes before creating a new branch')
    }

    // Create the branch
    const result = await this.gitAdapter.createBranch(finalBranchName, baseBranch)

    return {
      success: true,
      branch: finalBranchName,
      baseBranch,
      message: `Created and switched to branch '${finalBranchName}' from '${baseBranch}'`
    }
  }
}