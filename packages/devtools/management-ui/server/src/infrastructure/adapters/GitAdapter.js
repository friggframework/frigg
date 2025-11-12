import { exec } from 'child_process'
import { promisify } from 'util'
import { GitBranch } from '../../domain/entities/GitBranch.js'
import { GitRepository } from '../../domain/entities/GitRepository.js'

const execAsync = promisify(exec)

/**
 * Adapter for Git operations
 * Implements Git best practices for branch management
 */
export class GitAdapter {
  constructor({ projectPath }) {
    this.projectPath = projectPath
  }

  /**
   * Execute git command in project directory
   */
  async execGit(command) {
    try {
      const { stdout, stderr } = await execAsync(`git ${command}`, {
        cwd: this.projectPath
      })
      return { stdout: stdout.trim(), stderr: stderr.trim() }
    } catch (error) {
      throw new Error(`Git command failed: ${error.message}`)
    }
  }

  /**
   * Get repository status and information
   */
  async getRepository() {
    const [currentBranch, branches, remotes, status, config] = await Promise.all([
      this.getCurrentBranch(),
      this.listBranches(),
      this.listRemotes(),
      this.getStatus(),
      this.getConfig()
    ])

    return new GitRepository({
      path: this.projectPath,
      currentBranch,
      branches,
      remotes,
      status,
      config
    })
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch() {
    const { stdout } = await this.execGit('rev-parse --abbrev-ref HEAD')
    return stdout
  }

  /**
   * List all branches with details
   */
  async listBranches() {
    // Get local branches with upstream info
    const { stdout: localOutput } = await this.execGit('branch -vv')
    const branches = []

    const lines = localOutput.split('\n').filter(line => line.trim())
    for (const line of lines) {
      const current = line.startsWith('*')
      const parts = line.substring(2).trim().split(/\s+/)
      const name = parts[0]
      const commit = parts[1]

      // Parse upstream info [origin/branch: ahead 1, behind 2]
      const upstreamMatch = line.match(/\[([^\]]+)\]/)
      let upstream = null
      let ahead = 0
      let behind = 0

      if (upstreamMatch) {
        const upstreamInfo = upstreamMatch[1]
        const upstreamName = upstreamInfo.split(':')[0]
        upstream = upstreamName

        const aheadMatch = upstreamInfo.match(/ahead (\d+)/)
        const behindMatch = upstreamInfo.match(/behind (\d+)/)

        if (aheadMatch) ahead = parseInt(aheadMatch[1])
        if (behindMatch) behind = parseInt(behindMatch[1])
      }

      branches.push(new GitBranch({
        name,
        current,
        upstream,
        lastCommit: commit,
        ahead,
        behind
      }))
    }

    // Get remote branches
    try {
      const { stdout: remoteOutput } = await this.execGit('branch -r')
      const remoteLines = remoteOutput.split('\n').filter(line => line.trim())

      for (const line of remoteLines) {
        const remoteBranch = line.trim()
        if (!remoteBranch.includes('HEAD')) {
          const [remote, ...branchParts] = remoteBranch.split('/')
          const branchName = branchParts.join('/')

          // Check if we already have this as a local branch
          const existingBranch = branches.find(b => b.name === branchName)
          if (existingBranch) {
            existingBranch.remote = remote
          }
        }
      }
    } catch {
      // Remote branches might not exist
    }

    return branches
  }

  /**
   * Get repository status
   */
  async getStatus() {
    const { stdout } = await this.execGit('status --porcelain=v1')
    const lines = stdout.split('\n').filter(line => line.trim())

    const status = {
      modified: [],
      added: [],
      deleted: [],
      renamed: [],
      untracked: [],
      conflicted: []
    }

    for (const line of lines) {
      const statusCode = line.substring(0, 2)
      const file = line.substring(3)

      if (statusCode === '??') {
        status.untracked.push(file)
      } else if (statusCode.includes('M')) {
        status.modified.push(file)
      } else if (statusCode.includes('A')) {
        status.added.push(file)
      } else if (statusCode.includes('D')) {
        status.deleted.push(file)
      } else if (statusCode.includes('R')) {
        status.renamed.push(file)
      } else if (statusCode === 'UU') {
        status.conflicted.push(file)
      }
    }

    // Check if we can stash
    status.canStash = status.modified.length > 0 ||
                      status.added.length > 0 ||
                      status.deleted.length > 0

    return status
  }

  /**
   * List remotes
   */
  async listRemotes() {
    try {
      const { stdout } = await this.execGit('remote -v')
      const lines = stdout.split('\n').filter(line => line.trim())
      const remotes = {}

      for (const line of lines) {
        const [name, url, type] = line.split(/\s+/)
        if (!remotes[name]) {
          remotes[name] = {}
        }
        if (type === '(fetch)') {
          remotes[name].fetch = url
        } else if (type === '(push)') {
          remotes[name].push = url
        }
      }

      return Object.entries(remotes).map(([name, urls]) => ({
        name,
        ...urls
      }))
    } catch {
      return []
    }
  }

  /**
   * Get git config
   */
  async getConfig() {
    const config = {}

    try {
      const { stdout: userName } = await this.execGit('config user.name')
      config.userName = userName
    } catch {}

    try {
      const { stdout: userEmail } = await this.execGit('config user.email')
      config.userEmail = userEmail
    } catch {}

    return config
  }

  /**
   * Create new branch
   */
  async createBranch(branchName, baseBranch = null) {
    // Validate branch name
    if (!this.isValidBranchName(branchName)) {
      throw new Error('Invalid branch name. Use only alphanumeric, dash, underscore, and slash.')
    }

    // Create branch from base or current
    const command = baseBranch
      ? `checkout -b ${branchName} ${baseBranch}`
      : `checkout -b ${branchName}`

    await this.execGit(command)
    return { success: true, branch: branchName }
  }

  /**
   * Switch to branch
   */
  async switchBranch(branchName) {
    await this.execGit(`checkout ${branchName}`)
    return { success: true, branch: branchName }
  }

  /**
   * Delete branch
   */
  async deleteBranch(branchName, force = false) {
    const flag = force ? '-D' : '-d'
    await this.execGit(`branch ${flag} ${branchName}`)
    return { success: true, deleted: branchName }
  }

  /**
   * Stash changes
   */
  async stashChanges(message = null) {
    const command = message
      ? `stash push -m "${message}"`
      : 'stash push'

    const { stdout } = await this.execGit(command)
    return { success: true, message: stdout }
  }

  /**
   * Apply stash
   */
  async applyStash(stashId = null) {
    const command = stashId
      ? `stash apply ${stashId}`
      : 'stash apply'

    await this.execGit(command)
    return { success: true }
  }

  /**
   * Fetch from remote
   */
  async fetch(remote = 'origin') {
    await this.execGit(`fetch ${remote}`)
    return { success: true }
  }

  /**
   * Pull changes
   */
  async pull(remote = 'origin', branch = null) {
    const command = branch
      ? `pull ${remote} ${branch}`
      : `pull ${remote}`

    const { stdout } = await this.execGit(command)
    return { success: true, message: stdout }
  }

  /**
   * Push changes
   */
  async push(remote = 'origin', branch = null, setUpstream = false) {
    let command = 'push'

    if (setUpstream) {
      command += ' -u'
    }

    command += ` ${remote}`

    if (branch) {
      command += ` ${branch}`
    }

    const { stdout } = await this.execGit(command)
    return { success: true, message: stdout }
  }

  /**
   * Merge branch
   */
  async mergeBranch(branchName, noFastForward = false) {
    const command = noFastForward
      ? `merge --no-ff ${branchName}`
      : `merge ${branchName}`

    const { stdout } = await this.execGit(command)
    return { success: true, message: stdout }
  }

  /**
   * Validate branch name
   */
  isValidBranchName(name) {
    // Git branch naming rules
    const validPattern = /^[a-zA-Z0-9]([a-zA-Z0-9\-_\/])*[a-zA-Z0-9]$/
    return validPattern.test(name) && !name.includes('..')
  }
}