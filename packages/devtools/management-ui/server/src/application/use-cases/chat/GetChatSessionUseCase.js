/**
 * Get Chat Session Use Case
 *
 * Retrieves a single chat session by ID.
 */

export class GetChatSessionUseCase {
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
   * @param {string} params.sessionId - The session ID to retrieve
   * @returns {Promise<Object|null>} The session or null if not found
   */
  async execute({ sessionId }) {
    if (!sessionId) {
      throw new Error('Session ID is required')
    }

    return await this.chatSessionRepository.findById(sessionId)
  }
}

export default GetChatSessionUseCase
