/**
 * Save Chat Session Use Case
 *
 * Saves or updates a chat session to persistent storage.
 * Sessions are stored in the .frigg/chat-sessions directory
 * of the target Frigg project.
 */

export class SaveChatSessionUseCase {
  /**
   * @param {Object} params
   * @param {import('../../../infrastructure/repositories/ChatSessionRepository.js').ChatSessionRepository} params.chatSessionRepository
   */
  constructor({ chatSessionRepository }) {
    this.chatSessionRepository = chatSessionRepository
  }

  /**
   * Execute the use case
   * @param {Object} session - The chat session to save
   * @param {string} session.id - Session ID
   * @param {Array} session.messages - Conversation messages
   * @param {Array} [session.permissionActions] - Permission action history
   * @param {Object} [session.metadata] - Additional metadata
   * @returns {Promise<Object>} The saved session with updated timestamps
   */
  async execute(session) {
    if (!session?.id) {
      throw new Error('Session ID is required')
    }

    // Ensure timestamps
    const sessionToSave = {
      ...session,
      createdAt: session.createdAt || Date.now(),
      updatedAt: Date.now()
    }

    return await this.chatSessionRepository.save(sessionToSave)
  }
}

export default SaveChatSessionUseCase
