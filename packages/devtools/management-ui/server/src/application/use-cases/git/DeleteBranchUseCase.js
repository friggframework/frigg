/**
 * Use case for deleting a Git branch
 * Follows safety checks to prevent accidental deletion
 */
export class DeleteBranchUseCase {
  constructor({ gitAdapter }) {
    this.gitAdapter = gitAdapter
  }

  async execute({ branchName, force = false }) {
    if (!branchName) {
      throw new Error('Branch name is required')
    }

    // Get repository to check if branch can be deleted
    const repository = await this.gitAdapter.getRepository()
    const branch = repository.branches.find(b => b.name === branchName)

    if (!branch) {
      throw new Error(`Branch '${branchName}' not found`)
    }

    // Safety checks
    if (branch.current) {
      throw new Error('Cannot delete the current branch. Please switch to another branch first')
    }

    if (branch.protected && !force) {
      throw new Error(`Branch '${branchName}' is protected. Use force option to delete`)
    }

    if (branch.hasUnmergedChanges() && !force) {
      throw new Error(`Branch '${branchName}' has unmerged changes. Use force option to delete anyway`)
    }

    // Delete the branch
    await this.gitAdapter.deleteBranch(branchName, force)

    return {
      success: true,
      deleted: branchName,
      forced: force,
      message: `Branch '${branchName}' deleted${force ? ' (forced)' : ''}`
    }
  }
}