/**
 * Simple Git Adapter
 * Infrastructure layer adapter for git operations using simple-git
 */

import simpleGit from 'simple-git'

export class SimpleGitAdapter {
  constructor() {
    this.git = null
    this.projectPath = null
  }

  /**
   * Initialize git for a specific project path
   */
  _getGit(projectPath) {
    if (this.projectPath !== projectPath) {
      this.projectPath = projectPath
      this.git = simpleGit(projectPath)
    }
    return this.git
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(projectPath) {
    const git = this._getGit(projectPath)
    const status = await git.status()
    return status.current
  }

  /**
   * Get git status with categorized files
   */
  async getStatus(projectPath) {
    const git = this._getGit(projectPath)
    const status = await git.status()

    return {
      staged: status.staged || [],
      unstaged: status.modified.concat(status.deleted || []),
      untracked: status.not_added || []
    }
  }

  /**
   * Get list of branches
   */
  async getBranches(projectPath) {
    const git = this._getGit(projectPath)
    const result = await git.branch(['-a'])

    return result.all.map(branchName => {
      const branch = result.branches[branchName]
      return {
        name: branchName.replace('remotes/', '').replace('origin/', ''),
        current: branch.current,
        upstream: branch.linkedWorkTree || null,
        remote: branchName.includes('remotes/'),
        commit: branch.commit || null
      }
    })
  }

  /**
   * Switch to a different branch
   */
  async switchBranch(projectPath, { name, create = false, force = false }) {
    const git = this._getGit(projectPath)

    const args = []
    if (create) args.push('-b')
    if (force) args.push('-f')
    args.push(name)

    await git.checkout(args)
  }

  /**
   * Get repository information
   */
  async getRepository(projectPath) {
    const git = this._getGit(projectPath)

    const [currentBranch, log] = await Promise.all([
      git.status().then(s => s.current),
      git.log({ maxCount: 1 })
    ])

    return {
      currentBranch,
      headCommit: log.latest?.hash || null,
      branches: await this.getBranches(projectPath),
      remotes: await git.getRemotes(true),
      status: await this.getStatus(projectPath)
    }
  }
}
