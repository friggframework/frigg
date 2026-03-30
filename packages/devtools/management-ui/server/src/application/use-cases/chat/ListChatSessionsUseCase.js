/**
 * List Chat Sessions Use Case
 *
 * Lists all chat sessions, optionally as summaries for list views.
 */

export class ListChatSessionsUseCase {
  /**
   * @param {Object} params
   * @param {import('../../../infrastructure/repositories/ChatSessionRepository.js').ChatSessionRepository} params.chatSessionRepository
   */
  constructor({ chatSessionRepository }) {
    this.chatSessionRepository = chatSessionRepository
  }

  /**
   * Execute the use case
   * @param {Object} [params]
   * @param {boolean} [params.summaryOnly=true] - Return summaries instead of full sessions
   * @returns {Promise<Array>} List of sessions or summaries
   */
  async execute({ summaryOnly = true } = {}) {
    if (summaryOnly) {
      return await this.chatSessionRepository.findAllSummaries()
    }
    return await this.chatSessionRepository.findAll()
  }
}

export default ListChatSessionsUseCase
