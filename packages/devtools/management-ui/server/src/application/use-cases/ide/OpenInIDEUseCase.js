/**
 * Open In IDE Use Case
 * Opens a file or directory in the specified IDE
 */

export class OpenInIDEUseCase {
  constructor({ ideRepository, gitAdapter }) {
    this.ideRepository = ideRepository
    this.gitAdapter = gitAdapter
  }

  /**
   * Execute the use case
   * @param {Object} params
   * @param {string} params.filePath - The file or directory path to open
   * @param {string} params.ide - The IDE identifier (e.g., 'vscode', 'cursor')
   * @param {string} params.command - Custom command to use instead of IDE
   * @returns {Promise<Object>} Result with path, IDE info, and process details
   */
  async execute({ filePath, ide, command }) {
    if (!filePath) {
      throw new Error('File path is required')
    }

    if (!ide && !command) {
      throw new Error('Either IDE or custom command is required')
    }

    // Try to find git repository root to open workspace instead of single file
    let workspacePath = filePath
    let isGitRepo = false

    try {
      const gitRoot = await this.gitAdapter.getRepositoryRoot(filePath)
      if (gitRoot) {
        workspacePath = gitRoot
        isGitRepo = true
      }
    } catch {
      // Not a git repo or git not available, use original path
      workspacePath = filePath
    }

    // Launch the IDE
    const result = await this.ideRepository.openInIDE({
      path: workspacePath,
      ide,
      command
    })

    return {
      message: `Opening ${isGitRepo ? 'git repository' : 'path'} in ${ide || 'custom command'}`,
      path: workspacePath,
      originalPath: filePath,
      isGitRepo,
      ide: ide || 'custom',
      ...result
    }
  }
}

export default OpenInIDEUseCase
