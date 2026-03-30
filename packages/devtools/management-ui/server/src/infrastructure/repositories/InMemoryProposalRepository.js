/**
 * In-Memory Proposal Repository
 * Stores proposals in memory for the current server session
 *
 * Note: For production, this should be replaced with a persistent store
 */

export class InMemoryProposalRepository {
  constructor() {
    /** @type {Map<string, import('../../domain/entities/Proposal.js').Proposal>} */
    this.proposals = new Map()

    /** @type {Map<string, Set<string>>} sessionId -> Set of proposalIds */
    this.sessionProposals = new Map()
  }

  /**
   * Save a proposal
   * @param {import('../../domain/entities/Proposal.js').Proposal} proposal
   */
  async save(proposal) {
    this.proposals.set(proposal.id, proposal)

    // Track proposal by session
    if (!this.sessionProposals.has(proposal.sessionId)) {
      this.sessionProposals.set(proposal.sessionId, new Set())
    }
    this.sessionProposals.get(proposal.sessionId).add(proposal.id)

    return proposal
  }

  /**
   * Find proposal by ID
   * @param {string} id
   */
  async findById(id) {
    return this.proposals.get(id) || null
  }

  /**
   * Find all proposals for a session
   * @param {string} sessionId
   */
  async findBySessionId(sessionId) {
    const proposalIds = this.sessionProposals.get(sessionId)
    if (!proposalIds) {
      return []
    }

    return Array.from(proposalIds)
      .map(id => this.proposals.get(id))
      .filter(Boolean)
  }

  /**
   * Find pending proposals for a session
   * @param {string} sessionId
   */
  async findPendingBySessionId(sessionId) {
    const proposals = await this.findBySessionId(sessionId)
    return proposals.filter(p => p.status === 'pending')
  }

  /**
   * Delete a proposal
   * @param {string} id
   */
  async delete(id) {
    const proposal = this.proposals.get(id)
    if (proposal) {
      this.proposals.delete(id)
      const sessionProposals = this.sessionProposals.get(proposal.sessionId)
      if (sessionProposals) {
        sessionProposals.delete(id)
      }
      return true
    }
    return false
  }

  /**
   * Delete all proposals for a session
   * @param {string} sessionId
   */
  async deleteBySessionId(sessionId) {
    const proposalIds = this.sessionProposals.get(sessionId)
    if (proposalIds) {
      for (const id of proposalIds) {
        this.proposals.delete(id)
      }
      this.sessionProposals.delete(sessionId)
    }
  }

  /**
   * Get count of proposals
   */
  async count() {
    return this.proposals.size
  }

  /**
   * Clear all proposals (for testing)
   */
  async clear() {
    this.proposals.clear()
    this.sessionProposals.clear()
  }
}

export default InMemoryProposalRepository
