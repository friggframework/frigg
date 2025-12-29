/**
 * Stop Agent Session Use Case
 * Handles stopping an active AI agent session
 */

export class StopAgentSessionUseCase {
  constructor({ claudeAgentAdapter }) {
    this.claudeAgentAdapter = claudeAgentAdapter
  }

  /**
   * Execute the use case
   * @param {Object} params
   * @param {string} params.sessionId - Session ID to stop
   */
  async execute({ sessionId }) {
    if (!sessionId) {
      throw new Error('Session ID is required')
    }

    const stopped = await this.claudeAgentAdapter.stopSession(sessionId)

    return {
      sessionId,
      stopped,
      message: stopped ? 'Session stopped' : 'Session not found or already stopped'
    }
  }
}

export default StopAgentSessionUseCase
