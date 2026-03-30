/**
 * List Available IDEs Use Case
 * Returns list of supported IDEs and their availability
 */

export class ListAvailableIDEsUseCase {
  constructor({ ideRepository }) {
    this.ideRepository = ideRepository
  }

  /**
   * Execute the use case
   * @returns {Promise<{ides: Object}>}
   */
  async execute() {
    const ides = await this.ideRepository.getAvailableIDEs()
    return { ides }
  }
}

export default ListAvailableIDEsUseCase
