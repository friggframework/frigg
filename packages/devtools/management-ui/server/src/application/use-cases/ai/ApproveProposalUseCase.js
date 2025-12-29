/**
 * Approve Proposal Use Case
 * Approves a pending code change proposal and executes the change
 */

export class ApproveProposalUseCase {
  constructor({ proposalRepository, fileSystemAdapter }) {
    this.proposalRepository = proposalRepository
    this.fileSystemAdapter = fileSystemAdapter
  }

  /**
   * Execute the approval
   * @param {Object} params
   * @param {string} params.proposalId - The proposal ID to approve
   * @param {string} params.sessionId - The session ID (for validation)
   * @param {string} params.userId - Who is approving (optional)
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

    if (!proposal.canApprove()) {
      throw new Error(`Cannot approve proposal with status: ${proposal.status}`)
    }

    // Execute the file change
    const changes = proposal.getProposedChanges()
    let result

    try {
      if (changes.type === 'create') {
        // Write new file
        await this.fileSystemAdapter.writeFile(changes.filePath, changes.content)
        result = { action: 'created', filePath: changes.filePath }
      } else if (changes.type === 'edit') {
        // Edit existing file
        await this.fileSystemAdapter.editFile(
          changes.filePath,
          changes.oldString,
          changes.newString,
          changes.replaceAll
        )
        result = { action: 'edited', filePath: changes.filePath }
      } else {
        // For unknown tool types, we approve but don't execute
        result = { action: 'acknowledged', toolName: changes.toolName }
      }
    } catch (error) {
      throw new Error(`Failed to apply proposal: ${error.message}`)
    }

    // Mark as approved
    proposal.approve(userId)
    await this.proposalRepository.save(proposal)

    return {
      proposal: proposal.toJSON(),
      result
    }
  }
}

export default ApproveProposalUseCase
