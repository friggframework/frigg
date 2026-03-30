/**
 * GitBranch Entity
 * Represents a Git branch in the local repository
 * Follows Git best practices for branch management
 */
export class GitBranch {
  constructor({
    name,
    current = false,
    remote = null,
    upstream = null,
    lastCommit = null,
    ahead = 0,
    behind = 0,
    isProtected = false
  }) {
    this.name = name
    this.current = current
    this.remote = remote
    this.upstream = upstream
    this.lastCommit = lastCommit
    this.ahead = ahead  // Commits ahead of upstream
    this.behind = behind // Commits behind upstream
    this.isProtected = isProtected || this.isProtectedBranch(name)
  }

  /**
   * Check if branch name follows protected patterns
   * Best practice: protect main, master, develop, release/*, hotfix/*
   */
  isProtectedBranch(branchName) {
    const protectedPatterns = [
      'main',
      'master',
      'develop',
      'development',
      'staging',
      'production'
    ]

    const protectedPrefixes = [
      'release/',
      'hotfix/'
    ]

    // Check exact matches
    if (protectedPatterns.includes(branchName)) {
      return true
    }

    // Check prefix matches
    return protectedPrefixes.some(prefix => branchName.startsWith(prefix))
  }

  /**
   * Determine branch type based on naming conventions
   * Following Git Flow and GitHub Flow patterns
   */
  getBranchType() {
    const name = this.name.toLowerCase()

    if (['main', 'master'].includes(name)) {
      return 'main'
    }

    if (['develop', 'development'].includes(name)) {
      return 'develop'
    }

    if (name.startsWith('feature/')) {
      return 'feature'
    }

    if (name.startsWith('bugfix/') || name.startsWith('fix/')) {
      return 'bugfix'
    }

    if (name.startsWith('hotfix/')) {
      return 'hotfix'
    }

    if (name.startsWith('release/')) {
      return 'release'
    }

    if (name.startsWith('chore/')) {
      return 'chore'
    }

    if (name.startsWith('docs/')) {
      return 'documentation'
    }

    if (name.startsWith('test/')) {
      return 'test'
    }

    if (name.startsWith('refactor/')) {
      return 'refactor'
    }

    return 'other'
  }

  /**
   * Check if branch can be safely deleted
   * Best practice: prevent deletion of protected branches and current branch
   */
  canDelete() {
    return !this.current && !this.isProtected && !this.hasUnmergedChanges()
  }

  /**
   * Check if branch has unmerged changes
   */
  hasUnmergedChanges() {
    return this.ahead > 0
  }

  /**
   * Check if branch needs to be updated from upstream
   */
  needsUpdate() {
    return this.behind > 0
  }

  /**
   * Get branch status summary
   */
  getStatus() {
    if (this.ahead > 0 && this.behind > 0) {
      return 'diverged'
    }
    if (this.ahead > 0) {
      return 'ahead'
    }
    if (this.behind > 0) {
      return 'behind'
    }
    return 'up-to-date'
  }

  /**
   * Generate branch name suggestion based on type and description
   * Following conventional naming patterns
   */
  static suggestBranchName(type, description) {
    // Convert description to kebab-case
    const kebabDescription = description
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    const prefixMap = {
      feature: 'feature/',
      bugfix: 'fix/',
      hotfix: 'hotfix/',
      release: 'release/',
      chore: 'chore/',
      docs: 'docs/',
      test: 'test/',
      refactor: 'refactor/'
    }

    const prefix = prefixMap[type] || ''
    return `${prefix}${kebabDescription}`
  }

  toJSON() {
    return {
      name: this.name,
      current: this.current,
      remote: this.remote,
      upstream: this.upstream,
      lastCommit: this.lastCommit,
      ahead: this.ahead,
      behind: this.behind,
      isProtected: this.isProtected,
      type: this.getBranchType(),
      status: this.getStatus(),
      canDelete: this.canDelete(),
      needsUpdate: this.needsUpdate()
    }
  }
}