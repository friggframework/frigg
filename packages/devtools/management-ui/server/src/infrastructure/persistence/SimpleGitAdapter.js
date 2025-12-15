/**
 * Simple Git Adapter
 * Infrastructure layer adapter for git operations using simple-git
 */

import simpleGit from 'simple-git'
import path from 'path'
import fs from 'fs'

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
   * Get list of branches (alias for getAllBranches for backward compatibility)
   */
  async getBranches(projectPath) {
    return this.getAllBranches(projectPath)
  }

  /**
   * Get all branches with their types
   */
  async getAllBranches(projectPath) {
    const git = this._getGit(projectPath)
    const result = await git.branch(['-a'])

    return result.all.map(branchName => {
      const branch = result.branches[branchName]
      const isRemote = branchName.includes('remotes/')
      const cleanName = branchName.replace('remotes/', '').replace('origin/', '')

      return {
        name: cleanName,
        type: isRemote ? 'remote' : 'local',
        isCurrent: branch.current || false,
        upstream: branch.linkedWorkTree || null,
        commit: branch.commit || null
      }
    })
  }

  /**
   * Switch to a different branch (legacy interface)
   */
  async switchBranch(projectPath, { name, create = false, force = false }) {
    return this.checkout(projectPath, name, { create, force })
  }

  /**
   * Checkout a branch with options
   */
  async checkout(projectPath, branchName, { create = false, force = false } = {}) {
    const git = this._getGit(projectPath)

    const args = []
    if (create) args.push('-b')
    if (force) args.push('-f')
    args.push(branchName)

    await git.checkout(args)
  }

  /**
   * Get HEAD commit hash
   */
  async getHeadCommit(projectPath) {
    const git = this._getGit(projectPath)
    const log = await git.log({ maxCount: 1 })
    return log.latest?.hash || null
  }

  /**
   * Check if working directory has uncommitted changes
   */
  async isDirty(projectPath) {
    const git = this._getGit(projectPath)
    const status = await git.status()
    return !status.isClean()
  }

  /**
   * Get the root directory of the git repository
   */
  async getRepositoryRoot(filePath) {
    // Determine starting directory
    let searchDir = filePath
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath)
      if (stats.isFile()) {
        searchDir = path.dirname(filePath)
      }
    }

    try {
      const git = simpleGit(searchDir)
      const root = await git.revparse(['--show-toplevel'])
      return root.trim()
    } catch {
      return null
    }
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
