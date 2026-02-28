/**
 * Delete Chat Session Use Case
 *
 * Deletes a single chat session by ID or all sessions.
 */

export class DeleteChatSessionUseCase {
  /**
   * @param {Object} params
   * @param {import('../../../infrastructure/repositories/ChatSessionRepository.js').ChatSessionRepository} params.chatSessionRepository
   */
  constructor({ chatSessionRepository }) {
    this.chatSessionRepository = chatSessionRepository
  }

  /**
   * Execute the use case
   * @param {Object} params
   * @param {string} [params.sessionId] - The session ID to delete (omit to delete all)
   * @param {boolean} [params.all=false] - Delete all sessions
   * @returns {Promise<void>}
   */
  async execute({ sessionId, all = false }) {
    if (all) {
      return await this.chatSessionRepository.deleteAll()
    }

    if (!sessionId) {
      throw new Error('Session ID is required when not deleting all')
    }

    return await this.chatSessionRepository.delete(sessionId)
  }
}

export default DeleteChatSessionUseCase
