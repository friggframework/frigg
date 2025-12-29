/**
 * Reject Proposal Use Case
 * Rejects a pending code change proposal without executing any changes
 */

export class RejectProposalUseCase {
  constructor({ proposalRepository }) {
    this.proposalRepository = proposalRepository
  }

  /**
   * Execute the rejection
   * @param {Object} params
   * @param {string} params.proposalId - The proposal ID to reject
   * @param {string} params.sessionId - The session ID (for validation)
   * @param {string} params.userId - Who is rejecting (optional)
   * @param {string} params.reason - Reason for rejection (optional)
   */
  async execute({ proposalId, sessionId, userId = 'user', reason = null }) {
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

    if (!proposal.canReject()) {
      throw new Error(`Cannot reject proposal with status: ${proposal.status}`)
    }

    // Mark as rejected
    proposal.reject(userId)
    await this.proposalRepository.save(proposal)

    return {
      proposal: proposal.toJSON(),
      reason
    }
  }
}

export default RejectProposalUseCase
