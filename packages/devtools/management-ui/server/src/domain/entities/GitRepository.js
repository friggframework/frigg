import { GitBranch } from './GitBranch.js'

/**
 * GitRepository Entity
 * Represents the Git repository state and configuration
 */
export class GitRepository {
  constructor({
    path,
    currentBranch,
    branches = [],
    remotes = [],
    status = {},
    config = {}
  }) {
    this.path = path
    this.currentBranch = currentBranch
    this.branches = branches.map(b => b instanceof GitBranch ? b : new GitBranch(b))
    this.remotes = remotes
    this.status = status
    this.config = config
  }

  /**
   * Get the main branch (main or master)
   */
  getMainBranch() {
    return this.branches.find(b =>
      b.name === 'main' || b.name === 'master'
    ) || this.branches[0]
  }

  /**
   * Get develop branch if using Git Flow
   */
  getDevelopBranch() {
    return this.branches.find(b =>
      b.name === 'develop' || b.name === 'development'
    )
  }

  /**
   * Check if repository uses Git Flow
   */
  usesGitFlow() {
    return !!this.getDevelopBranch()
  }

  /**
   * Get branches by type
   */
  getBranchesByType(type) {
    return this.branches.filter(b => b.getBranchType() === type)
  }

  /**
   * Check if repository has uncommitted changes
   */
  hasUncommittedChanges() {
    return this.status.modified?.length > 0 ||
           this.status.added?.length > 0 ||
           this.status.deleted?.length > 0 ||
           this.status.untracked?.length > 0
  }

  /**
   * Check if it's safe to switch branches
   */
  canSwitchBranch() {
    // Best practice: stash or commit changes before switching
    return !this.hasUncommittedChanges() || this.status.canStash
  }

  /**
   * Get repository workflow type
   */
  getWorkflowType() {
    if (this.usesGitFlow()) {
      return 'git-flow'
    }

    // Check for GitHub Flow (simpler, main + feature branches)
    const hasMainOnly = this.branches.every(b =>
      b.getBranchType() === 'main' ||
      b.getBranchType() === 'feature' ||
      b.getBranchType() === 'bugfix'
    )

    if (hasMainOnly) {
      return 'github-flow'
    }

    return 'custom'
  }

  /**
   * Get recommended base branch for new feature
   */
  getBaseBranchForFeature() {
    // Git Flow: branch from develop
    if (this.usesGitFlow()) {
      return this.getDevelopBranch()?.name || 'develop'
    }

    // GitHub Flow: branch from main
    return this.getMainBranch()?.name || 'main'
  }

  /**
   * Get merge target for current branch
   */
  getMergeTarget(branchName) {
    const branch = this.branches.find(b => b.name === branchName)
    if (!branch) return null

    const type = branch.getBranchType()

    // Based on branch type and workflow
    switch (type) {
      case 'feature':
      case 'bugfix':
        return this.usesGitFlow() ? 'develop' : this.getMainBranch()?.name

      case 'hotfix':
        return this.getMainBranch()?.name

      case 'release':
        return this.getMainBranch()?.name

      case 'develop':
        return this.getMainBranch()?.name

      default:
        return branch.upstream || this.getMainBranch()?.name
    }
  }

  toJSON() {
    return {
      path: this.path,
      currentBranch: this.currentBranch,
      branches: this.branches.map(b => b.toJSON()),
      remotes: this.remotes,
      status: this.status,
      config: this.config,
      workflow: this.getWorkflowType(),
      hasUncommittedChanges: this.hasUncommittedChanges(),
      canSwitchBranch: this.canSwitchBranch()
    }
  }
}