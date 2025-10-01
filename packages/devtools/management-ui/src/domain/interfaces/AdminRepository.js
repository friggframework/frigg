/**
 * AdminRepository Interface
 * Defines the contract for admin operations
 * Following hexagonal architecture - this is a port
 */
class AdminRepository {
  /**
   * List all users with pagination
   * @param {Object} options - Query options
   * @param {number} options.page - Page number
   * @param {number} options.limit - Items per page
   * @param {string} options.sortBy - Sort field
   * @param {string} options.sortOrder - Sort order (asc/desc)
   * @returns {Promise<{users: AdminUser[], pagination: Object}>}
   */
  async listUsers(options = {}) {
    throw new Error('Method not implemented')
  }

  /**
   * Search users by query
   * @param {string} query - Search query
   * @param {Object} options - Query options
   * @returns {Promise<{users: AdminUser[], pagination: Object}>}
   */
  async searchUsers(query, options = {}) {
    throw new Error('Method not implemented')
  }

  /**
   * Create a new user
   * @param {Object} userData - User data
   * @param {string} userData.username - Username
   * @param {string} userData.password - Password
   * @param {string} userData.email - Email (optional)
   * @returns {Promise<AdminUser>}
   */
  async createUser(userData) {
    throw new Error('Method not implemented')
  }

  /**
   * List all global entities
   * @returns {Promise<GlobalEntity[]>}
   */
  async listGlobalEntities() {
    throw new Error('Method not implemented')
  }

  /**
   * Get a specific global entity
   * @param {string} id - Entity ID
   * @returns {Promise<GlobalEntity>}
   */
  async getGlobalEntity(id) {
    throw new Error('Method not implemented')
  }

  /**
   * Create a global entity
   * @param {Object} entityData - Entity data
   * @param {string} entityData.entityType - Entity type
   * @param {Object} entityData.credentials - Entity credentials
   * @param {string} entityData.name - Entity name (optional)
   * @returns {Promise<GlobalEntity>}
   */
  async createGlobalEntity(entityData) {
    throw new Error('Method not implemented')
  }

  /**
   * Test a global entity connection
   * @param {string} id - Entity ID
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async testGlobalEntity(id) {
    throw new Error('Method not implemented')
  }

  /**
   * Delete a global entity
   * @param {string} id - Entity ID
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async deleteGlobalEntity(id) {
    throw new Error('Method not implemented')
  }
}

export { AdminRepository }
