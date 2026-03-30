/**
 * Application service for Git operations
 * Coordinates Git-related use cases
 */
export class GitService {
  constructor({
    getRepositoryStatusUseCase,
    createBranchUseCase,
    switchBranchUseCase,
    deleteBranchUseCase,
    syncBranchUseCase
  }) {
    this.getRepositoryStatusUseCase = getRepositoryStatusUseCase
    this.createBranchUseCase = createBranchUseCase
    this.switchBranchUseCase = switchBranchUseCase
    this.deleteBranchUseCase = deleteBranchUseCase
    this.syncBranchUseCase = syncBranchUseCase
  }

  async getRepositoryStatus() {
    return this.getRepositoryStatusUseCase.execute()
  }

  async createBranch({ name, baseBranch, type, description }) {
    return this.createBranchUseCase.execute({
      branchName: name,
      baseBranch,
      branchType: type,
      description
    })
  }

  async switchBranch(branchName, autoStash = false) {
    return this.switchBranchUseCase.execute({ branchName, autoStash })
  }

  async deleteBranch(branchName, force = false) {
    return this.deleteBranchUseCase.execute({ branchName, force })
  }

  async syncBranch(branchName, operation = 'pull') {
    return this.syncBranchUseCase.execute({ branchName, operation })
  }

  async stashChanges(message) {
    // Direct adapter call for simple operations
    const gitAdapter = this.getRepositoryStatusUseCase.gitAdapter
    return gitAdapter.stashChanges(message)
  }

  async applyStash(stashId) {
    const gitAdapter = this.getRepositoryStatusUseCase.gitAdapter
    return gitAdapter.applyStash(stashId)
  }
}