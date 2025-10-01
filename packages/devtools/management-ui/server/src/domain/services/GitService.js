/**
 * Git Domain Service
 * Encapsulates git operations following DDD principles
 * Returns data in the format expected by the API spec
 */

export class GitService {
  constructor({ gitAdapter }) {
    this.gitAdapter = gitAdapter
  }

  /**
   * Get git status with file counts (for API response)
   * @param {string} projectPath - Path to the git repository
   * @returns {Promise<{current_branch: string, status: {staged: number, unstaged: number, untracked: number}}>}
   */
  async getStatus(projectPath) {
    const status = await this.gitAdapter.getStatus(projectPath)
    const currentBranch = await this.gitAdapter.getCurrentBranch(projectPath)

    return {
      currentBranch: currentBranch,
      status: {
        staged: Array.isArray(status.staged) ? status.staged.length : 0,
        unstaged: Array.isArray(status.unstaged) ? status.unstaged.length : 0,
        untracked: Array.isArray(status.untracked) ? status.untracked.length : 0
      }
    }
  }

  /**
   * Get detailed git status with file lists (for detailed view)
   * @param {string} projectPath - Path to the git repository
   * @returns {Promise<{branch: string, staged: string[], unstaged: string[], untracked: string[], clean: boolean}>}
   */
  async getDetailedStatus(projectPath) {
    const status = await this.gitAdapter.getStatus(projectPath)
    const currentBranch = await this.gitAdapter.getCurrentBranch(projectPath)

    const staged = status.staged || []
    const unstaged = status.unstaged || []
    const untracked = status.untracked || []

    return {
      branch: currentBranch,
      staged,
      unstaged,
      untracked,
      clean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0
    }
  }

  /**
   * Get list of branches
   * @param {string} projectPath - Path to the git repository
   * @returns {Promise<{current: string, branches: Array}>}
   */
  async getBranches(projectPath) {
    const branches = await this.gitAdapter.getBranches(projectPath)
    const currentBranch = await this.gitAdapter.getCurrentBranch(projectPath)

    return {
      current: currentBranch,
      branches: branches.map(branch => ({
        name: branch.name,
        type: branch.remote ? 'remote' : 'local',
        head_commit: branch.commit || null,
        tracking: branch.upstream || null,
        is_current: branch.current || false
      }))
    }
  }

  /**
   * Switch to a different branch
   * @param {string} projectPath - Path to the git repository
   * @param {Object} options - Switch options
   * @param {string} options.name - Branch name
   * @param {boolean} options.create - Create new branch
   * @param {boolean} options.force - Force switch
   * @returns {Promise<{name: string, head_commit: string, dirty: boolean}>}
   */
  async switchBranch(projectPath, { name, create = false, force = false }) {
    await this.gitAdapter.switchBranch(projectPath, { name, create, force })

    // Get head commit
    const repo = await this.gitAdapter.getRepository(projectPath)
    const status = await this.gitAdapter.getStatus(projectPath)

    const isDirty = (status.staged?.length || 0) > 0 ||
                    (status.unstaged?.length || 0) > 0 ||
                    (status.untracked?.length || 0) > 0

    return {
      name,
      head_commit: repo.headCommit || null,
      dirty: isDirty
    }
  }
}
