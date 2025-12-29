/**
 * Rollback Proposal Use Case
 * Rolls back an approved code change by restoring the original state
 */

export class RollbackProposalUseCase {
  constructor({ proposalRepository, fileSystemAdapter }) {
    this.proposalRepository = proposalRepository
    this.fileSystemAdapter = fileSystemAdapter
  }

  /**
   * Execute the rollback
   * @param {Object} params
   * @param {string} params.proposalId - The proposal ID to rollback
   * @param {string} params.sessionId - The session ID (for validation)
   * @param {string} params.userId - Who is rolling back (optional)
   */
  async execute({ proposalId, sessionId, userId = 'user' }) {
    if (!proposalId) {
      throw new Error('Proposal ID is required')
    }

    const proposal = await this.proposalRepository.findById(proposalId)

    if (!proposal) {
      throw new Error(`Proposal not found: ${proposalId}`)
    }

    if (sessionId && proposal.sessionId !== sessionId) {
      throw new Error('Proposal does not belong to this session')
    }

    if (!proposal.canRollback()) {
      throw new Error(`Cannot rollback proposal with status: ${proposal.status}`)
    }

    // Rollback the file change
    const changes = proposal.getProposedChanges()
    let result

    try {
      if (changes.type === 'create') {
        // Delete the created file
        await this.fileSystemAdapter.deleteFile(changes.filePath)
        result = { action: 'deleted', filePath: changes.filePath }
      } else if (changes.type === 'edit') {
        // Reverse the edit (swap old and new)
        await this.fileSystemAdapter.editFile(
          changes.filePath,
          changes.newString,
          changes.oldString,
          changes.replaceAll
        )
        result = { action: 'reverted', filePath: changes.filePath }
      } else {
        // For unknown tool types, we mark as rolled back but can't actually undo
        result = {
          action: 'marked_rolled_back',
          toolName: changes.toolName,
          warning: 'Original action cannot be automatically reverted'
        }
      }
    } catch (error) {
      throw new Error(`Failed to rollback proposal: ${error.message}`)
    }

    // Mark as rolled back
    proposal.rollback(userId)
    await this.proposalRepository.save(proposal)

    return {
      proposal: proposal.toJSON(),
      result
    }
  }
}

export default RollbackProposalUseCase
