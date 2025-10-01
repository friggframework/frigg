/**
 * IntegrationRepository Interface (Port)
 * Defines the contract for integration data access
 */
export class IntegrationRepository {
  /**
   * Get all integrations
   * @returns {Promise<Integration[]>}
   */
  async getAll() {
    throw new Error('Method getAll must be implemented')
  }

  /**
   * Get integration by name
   * @param {string} name
   * @returns {Promise<Integration|null>}
   */
  async getByName(name) {
    throw new Error('Method getByName must be implemented')
  }

  /**
   * Install integration
   * @param {string} name
   * @returns {Promise<Integration>}
   */
  async install(name) {
    throw new Error('Method install must be implemented')
  }

  /**
   * Uninstall integration
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async uninstall(name) {
    throw new Error('Method uninstall must be implemented')
  }

  /**
   * Update integration configuration
   * @param {string} name
   * @param {Object} config
   * @returns {Promise<Integration>}
   */
  async updateConfig(name, config) {
    throw new Error('Method updateConfig must be implemented')
  }

  /**
   * Check integration connection
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async checkConnection(name) {
    throw new Error('Method checkConnection must be implemented')
  }
}