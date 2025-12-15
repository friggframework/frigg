/**
 * FriggAdminApiAdapter
 * Infrastructure adapter for admin API operations via the Frigg app
 *
 * This adapter provides a high-level interface for:
 * - User management (CRUD operations via admin router)
 * - Global entity management (admin-only entity operations)
 * - User impersonation for testing
 *
 * All operations require connection to a running Frigg app with admin API key
 */

export class FriggAdminApiAdapter {
  /**
   * @param {object} params
   * @param {FriggAppHttpAdapter} params.friggAppAdapter - HTTP adapter for Frigg app communication
   */
  constructor({ friggAppAdapter }) {
    this._friggAppAdapter = friggAppAdapter
  }

  /**
   * Ensure adapter is connected before making requests
   * @throws {Error} If not connected
   */
  _requireConnection() {
    if (!this._friggAppAdapter.isConnected()) {
      throw new Error('Not connected to Frigg app')
    }
  }

  // ============================================
  // User Management
  // ============================================

  /**
   * List users with pagination
   * @param {object} [options] - Pagination options
   * @param {number} [options.page=1] - Page number
   * @param {number} [options.limit=10] - Items per page
   * @returns {Promise<object>} Users list with pagination info
   */
  async listUsers(options = {}) {
    this._requireConnection()

    return this._friggAppAdapter.makeRequest('GET', '/api/admin/users', {
      params: {
        page: options.page || 1,
        limit: options.limit || 10
      }
    })
  }

  /**
   * Search users by query
   * @param {string} query - Search query
   * @param {object} [options] - Search options
   * @param {number} [options.limit=20] - Max results
   * @returns {Promise<object>} Search results
   */
  async searchUsers(query, options = {}) {
    this._requireConnection()

    return this._friggAppAdapter.makeRequest('GET', '/api/admin/users/search', {
      params: {
        q: query,
        limit: options.limit || 20
      }
    })
  }

  /**
   * Create a new user
   * @param {object} userData - User data
   * @param {string} userData.email - User email
   * @param {string} [userData.password] - User password (if using password auth)
   * @returns {Promise<object>} Created user
   */
  async createUser(userData) {
    this._requireConnection()

    return this._friggAppAdapter.makeRequest('POST', '/api/admin/users', userData)
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<object>} User data
   */
  async getUser(userId) {
    this._requireConnection()

    return this._friggAppAdapter.makeRequest('GET', `/api/admin/users/${userId}`)
  }

  /**
   * Delete a user
   * @param {string} userId - User ID
   * @returns {Promise<object>} Deletion result
   */
  async deleteUser(userId) {
    this._requireConnection()

    return this._friggAppAdapter.makeRequest('DELETE', `/api/admin/users/${userId}`)
  }

  /**
   * Impersonate a user (generate impersonation token)
   * @param {string} userId - User ID to impersonate
   * @returns {Promise<object>} Impersonation token
   */
  async impersonateUser(userId) {
    this._requireConnection()

    return this._friggAppAdapter.makeRequest('POST', `/api/admin/users/${userId}/impersonate`)
  }

  // ============================================
  // Global Entity Management
  // ============================================

  /**
   * List all global entities
   * @returns {Promise<object>} Global entities list
   */
  async listGlobalEntities() {
    this._requireConnection()

    return this._friggAppAdapter.makeRequest('GET', '/api/admin/entities')
  }

  /**
   * Get a global entity by ID
   * @param {string} entityId - Entity ID
   * @returns {Promise<object>} Entity data
   */
  async getGlobalEntity(entityId) {
    this._requireConnection()

    return this._friggAppAdapter.makeRequest('GET', `/api/admin/entities/${entityId}`)
  }

  /**
   * Create a new global entity
   * @param {object} entityData - Entity data
   * @param {string} entityData.type - Entity type (e.g., 'HubSpot', 'Salesforce')
   * @param {object} [entityData.credentials] - Entity credentials
   * @returns {Promise<object>} Created entity
   */
  async createGlobalEntity(entityData) {
    this._requireConnection()

    // Ensure isGlobal flag is set
    const dataWithGlobalFlag = {
      ...entityData,
      isGlobal: true
    }

    return this._friggAppAdapter.makeRequest('POST', '/api/admin/entities', dataWithGlobalFlag)
  }

  /**
   * Update a global entity
   * @param {string} entityId - Entity ID
   * @param {object} updates - Updates to apply
   * @returns {Promise<object>} Updated entity
   */
  async updateGlobalEntity(entityId, updates) {
    this._requireConnection()

    return this._friggAppAdapter.makeRequest('PUT', `/api/admin/entities/${entityId}`, updates)
  }

  /**
   * Delete a global entity
   * @param {string} entityId - Entity ID
   * @returns {Promise<object>} Deletion result
   */
  async deleteGlobalEntity(entityId) {
    this._requireConnection()

    return this._friggAppAdapter.makeRequest('DELETE', `/api/admin/entities/${entityId}`)
  }

  /**
   * Test a global entity's connection
   * @param {string} entityId - Entity ID
   * @returns {Promise<object>} Test result
   */
  async testGlobalEntity(entityId) {
    this._requireConnection()

    return this._friggAppAdapter.makeRequest('POST', `/api/admin/entities/${entityId}/test`)
  }

  // ============================================
  // Connection & Status
  // ============================================

  /**
   * Check if connected to Frigg app
   * @returns {boolean}
   */
  isConnected() {
    return this._friggAppAdapter.isConnected()
  }

  /**
   * Get user management mode from connection
   * @returns {UserManagementMode|null}
   */
  getUserManagementMode() {
    return this._friggAppAdapter.getConnection().getUserManagementMode()
  }
}
