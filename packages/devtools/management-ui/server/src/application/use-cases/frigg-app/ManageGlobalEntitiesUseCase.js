/**
 * ManageGlobalEntitiesUseCase
 * Application Layer - Use case for admin-only global entity management
 *
 * Global entities are integration credentials that are shared across all users.
 * This use case provides CRUD operations for managing them through the admin API.
 *
 * Note: All operations require admin access via the Frigg admin router.
 */

export class ManageGlobalEntitiesUseCase {
  /**
   * @param {object} params
   * @param {FriggAdminApiAdapter} params.adminApiAdapter - Admin API adapter
   */
  constructor({ adminApiAdapter }) {
    this._adminApiAdapter = adminApiAdapter
  }

  /**
   * Check connection and return error result if not connected
   * @returns {object|null} Error result or null if connected
   * @private
   */
  _checkConnection() {
    if (!this._adminApiAdapter.isConnected()) {
      return {
        success: false,
        error: 'Not connected to Frigg app. Connect with admin credentials first.'
      }
    }
    return null
  }

  /**
   * List all global entities
   * @returns {Promise<object>} Result with entities array
   */
  async list() {
    const connectionError = this._checkConnection()
    if (connectionError) return connectionError

    try {
      const response = await this._adminApiAdapter.listGlobalEntities()
      return {
        success: true,
        entities: response.entities || []
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to list global entities: ${error.message}`
      }
    }
  }

  /**
   * Get a specific global entity by ID
   * @param {string} entityId - Entity ID
   * @returns {Promise<object>} Result with entity data
   */
  async get(entityId) {
    if (!entityId) {
      return {
        success: false,
        error: 'Entity ID is required'
      }
    }

    const connectionError = this._checkConnection()
    if (connectionError) return connectionError

    try {
      const entity = await this._adminApiAdapter.getGlobalEntity(entityId)
      return {
        success: true,
        entity
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to get entity: ${error.message}`
      }
    }
  }

  /**
   * Create a new global entity
   * @param {object} entityData - Entity data
   * @param {string} entityData.type - Entity type (e.g., 'HubSpot')
   * @param {object} [entityData.credentials] - Credentials
   * @returns {Promise<object>} Result with created entity
   */
  async create(entityData) {
    if (!entityData?.type) {
      return {
        success: false,
        error: 'Entity type is required'
      }
    }

    const connectionError = this._checkConnection()
    if (connectionError) return connectionError

    try {
      const entity = await this._adminApiAdapter.createGlobalEntity(entityData)
      return {
        success: true,
        entity
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to create entity: ${error.message}`
      }
    }
  }

  /**
   * Update an existing global entity
   * @param {string} entityId - Entity ID
   * @param {object} updates - Updates to apply
   * @returns {Promise<object>} Result with updated entity
   */
  async update(entityId, updates) {
    if (!entityId) {
      return {
        success: false,
        error: 'Entity ID is required'
      }
    }

    const connectionError = this._checkConnection()
    if (connectionError) return connectionError

    try {
      const entity = await this._adminApiAdapter.updateGlobalEntity(entityId, updates)
      return {
        success: true,
        entity
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to update entity: ${error.message}`
      }
    }
  }

  /**
   * Delete a global entity
   * @param {string} entityId - Entity ID
   * @returns {Promise<object>} Result indicating success
   */
  async delete(entityId) {
    if (!entityId) {
      return {
        success: false,
        error: 'Entity ID is required'
      }
    }

    const connectionError = this._checkConnection()
    if (connectionError) return connectionError

    try {
      await this._adminApiAdapter.deleteGlobalEntity(entityId)
      return {
        success: true
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete entity: ${error.message}`
      }
    }
  }

  /**
   * Test a global entity's connection
   * @param {string} entityId - Entity ID
   * @returns {Promise<object>} Result with test status
   */
  async test(entityId) {
    if (!entityId) {
      return {
        success: false,
        error: 'Entity ID is required'
      }
    }

    const connectionError = this._checkConnection()
    if (connectionError) return connectionError

    try {
      const response = await this._adminApiAdapter.testGlobalEntity(entityId)
      return {
        success: response.success,
        status: response.status,
        responseTime: response.responseTime,
        error: response.error
      }
    } catch (error) {
      return {
        success: false,
        status: 'error',
        error: `Failed to test entity: ${error.message}`
      }
    }
  }
}
