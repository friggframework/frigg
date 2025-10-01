/**
 * Use case for switching Git branches
 * Handles stashing if necessary
 */
export class SwitchBranchUseCase {
  constructor({ gitAdapter }) {
    this.gitAdapter = gitAdapter
  }

  async execute({ branchName, autoStash = false }) {
    if (!branchName) {
      throw new Error('Branch name is required')
    }

    // Check for uncommitted changes
    const status = await this.gitAdapter.getStatus()
    const hasChanges = status.modified.length > 0 ||
                      status.added.length > 0 ||
                      status.deleted.length > 0

    if (hasChanges) {
      if (autoStash) {
        // Auto-stash changes before switching
        const stashMessage = `Auto-stash before switching to ${branchName}`
        await this.gitAdapter.stashChanges(stashMessage)
      } else {
        throw new Error('You have uncommitted changes. Please commit, stash, or use autoStash option')
      }
    }

    // Switch to the branch
    await this.gitAdapter.switchBranch(branchName)

    // Try to apply stash if we auto-stashed
    let stashApplied = false
    if (hasChanges && autoStash) {
      try {
        await this.gitAdapter.applyStash()
        stashApplied = true
      } catch (error) {
        // Stash might conflict, that's ok
        console.warn('Could not automatically apply stash:', error.message)
      }
    }

    return {
      success: true,
      branch: branchName,
      previousBranch: status.currentBranch,
      stashed: hasChanges && autoStash,
      stashApplied,
      message: `Switched to branch '${branchName}'${hasChanges && autoStash ? ' (changes were stashed)' : ''}`
    }
  }
}