/**
 * Use case for synchronizing a git branch with remote
 * Handles fetching, merging, and pushing changes
 */
export class SyncBranchUseCase {
  constructor({ gitAdapter }) {
    this.gitAdapter = gitAdapter
  }

  async execute({ branchName, remote = 'origin', strategy = 'merge' }) {
    // Validate branch exists
    const branches = await this.gitAdapter.getBranches()
    const branch = branches.find(b => b.name === branchName)

    if (!branch) {
      throw new Error(`Branch ${branchName} not found`)
    }

    // Check if we're on the target branch
    const currentBranch = await this.gitAdapter.getCurrentBranch()
    if (currentBranch !== branchName) {
      throw new Error(`Cannot sync ${branchName}: currently on ${currentBranch}. Switch to the branch first.`)
    }

    // Check for uncommitted changes
    const status = await this.gitAdapter.getStatus()
    if (status.modified.length > 0 || status.added.length > 0 || status.deleted.length > 0) {
      throw new Error('Cannot sync with uncommitted changes. Please commit or stash your changes first.')
    }

    const syncResult = {
      branch: branchName,
      remote,
      strategy,
      operations: [],
      conflicts: [],
      success: false
    }

    try {
      // Fetch from remote
      syncResult.operations.push('fetch')
      const fetchResult = await this.gitAdapter.fetch(remote)

      if (!fetchResult.success) {
        throw new Error(`Failed to fetch from ${remote}: ${fetchResult.error}`)
      }

      // Check if remote branch exists
      const remoteBranch = `${remote}/${branchName}`
      const remoteBranches = await this.gitAdapter.getRemoteBranches()

      if (!remoteBranches.includes(remoteBranch)) {
        // Remote branch doesn't exist, push current branch
        syncResult.operations.push('push')
        const pushResult = await this.gitAdapter.push(remote, branchName)

        if (!pushResult.success) {
          throw new Error(`Failed to push to ${remote}: ${pushResult.error}`)
        }

        syncResult.success = true
        syncResult.message = `Branch ${branchName} pushed to ${remote} (new remote branch)`
        return syncResult
      }

      // Check if branches have diverged
      const comparison = await this.gitAdapter.compareBranches(branchName, remoteBranch)

      if (comparison.ahead === 0 && comparison.behind === 0) {
        syncResult.success = true
        syncResult.message = `Branch ${branchName} is already up to date with ${remote}`
        return syncResult
      }

      // Handle different sync strategies
      if (strategy === 'merge') {
        syncResult.operations.push('merge')
        const mergeResult = await this.gitAdapter.merge(remoteBranch)

        if (!mergeResult.success) {
          syncResult.conflicts = mergeResult.conflicts || []
          throw new Error(`Merge conflicts detected. Please resolve conflicts manually.`)
        }
      } else if (strategy === 'rebase') {
        syncResult.operations.push('rebase')
        const rebaseResult = await this.gitAdapter.rebase(remoteBranch)

        if (!rebaseResult.success) {
          syncResult.conflicts = rebaseResult.conflicts || []
          throw new Error(`Rebase conflicts detected. Please resolve conflicts manually.`)
        }
      } else {
        throw new Error(`Unknown sync strategy: ${strategy}`)
      }

      // Push any local commits if we're ahead
      if (comparison.ahead > 0) {
        syncResult.operations.push('push')
        const pushResult = await this.gitAdapter.push(remote, branchName)

        if (!pushResult.success) {
          throw new Error(`Failed to push to ${remote}: ${pushResult.error}`)
        }
      }

      syncResult.success = true
      syncResult.message = `Branch ${branchName} synchronized with ${remote} using ${strategy}`

      return syncResult

    } catch (error) {
      syncResult.error = error.message
      throw error
    }
  }

  async executeForce({ branchName, remote = 'origin', direction = 'pull' }) {
    // Force sync - either force pull or force push
    const currentBranch = await this.gitAdapter.getCurrentBranch()
    if (currentBranch !== branchName) {
      throw new Error(`Cannot force sync ${branchName}: currently on ${currentBranch}`)
    }

    if (direction === 'pull') {
      // Force pull (reset to remote)
      await this.gitAdapter.fetch(remote)
      const resetResult = await this.gitAdapter.resetHard(`${remote}/${branchName}`)

      if (!resetResult.success) {
        throw new Error(`Failed to force pull: ${resetResult.error}`)
      }

      return {
        success: true,
        branch: branchName,
        operation: 'force-pull',
        message: `Branch ${branchName} reset to match ${remote}/${branchName}`
      }
    } else if (direction === 'push') {
      // Force push
      const pushResult = await this.gitAdapter.pushForce(remote, branchName)

      if (!pushResult.success) {
        throw new Error(`Failed to force push: ${pushResult.error}`)
      }

      return {
        success: true,
        branch: branchName,
        operation: 'force-push',
        message: `Branch ${branchName} force pushed to ${remote}`
      }
    } else {
      throw new Error(`Unknown force direction: ${direction}`)
    }
  }
}