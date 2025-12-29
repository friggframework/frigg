/**
 * Get Agent Session Status Use Case
 * Retrieves the status of an AI agent session
 */

export class GetAgentSessionStatusUseCase {
  constructor({ claudeAgentAdapter }) {
    this.claudeAgentAdapter = claudeAgentAdapter
  }

  /**
   * Execute the use case
   * @param {Object} params
   * @param {string} params.sessionId - Session ID to check
   */
  async execute({ sessionId }) {
    if (!sessionId) {
      throw new Error('Session ID is required')
    }

    const status = this.claudeAgentAdapter.getSessionStatus(sessionId)

    if (!status) {
      return {
        sessionId,
        exists: false,
        message: 'Session not found'
      }
    }

    return {
      ...status,
      exists: true
    }
  }
}

export default GetAgentSessionStatusUseCase
