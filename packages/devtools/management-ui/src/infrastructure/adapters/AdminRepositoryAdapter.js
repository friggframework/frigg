import { AdminRepository } from '../../domain/interfaces/AdminRepository.js'

/**
 * AdminRepositoryAdapter
 * Infrastructure adapter implementing AdminRepository
 * Calls the Frigg API directly (NOT the Management UI backend)
 * The apiClient passed to constructor should be configured with friggBaseUrl
 */
class AdminRepositoryAdapter extends AdminRepository {
  constructor(apiClient) {
    super()
    if (!apiClient) {
      throw new Error('AdminRepositoryAdapter requires an apiClient')
    }
    this.api = apiClient
  }

  /**
   * List all users with pagination
   */
  async listUsers(options = {}) {
    const {
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options

    const response = await this.api.get('/api/admin/users', {
      params: {
        page,
        limit,
        sortBy,
        sortOrder
      }
    })

    return response.data
  }

  /**
   * Search users by query
   */
  async searchUsers(query, options = {}) {
    const {
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options

    const response = await this.api.get('/api/admin/users/search', {
      params: {
        q: query,
        page,
        limit,
        sortBy,
        sortOrder
      }
    })

    return response.data
  }

  /**
   * Create a new user
   */
  async createUser(userData) {
    // Note: The Frigg API handles user creation via POST /users
    // But we're calling through the management-ui which should proxy properly
    const response = await this.api.post('/api/admin/users', userData)
    return response.data.user || response.data
  }

  /**
   * Delete a user by ID
   */
  async deleteUser(userId) {
    const response = await this.api.delete(`/api/admin/users/${userId}`)
    return response.status === 204
  }

  /**
   * List all global entities
   */
  async listGlobalEntities() {
    const response = await this.api.get('/api/admin/global-entities')
    return response.data.globalEntities || []
  }

  /**
   * Get a specific global entity
   */
  async getGlobalEntity(id) {
    const response = await this.api.get(`/api/admin/global-entities/${id}`)
    return response.data
  }

  /**
   * Create a global entity
   */
  async createGlobalEntity(entityData) {
    const response = await this.api.post('/api/admin/global-entities', entityData)
    return response.data
  }

  /**
   * Test a global entity connection
   */
  async testGlobalEntity(id) {
    const response = await this.api.post(`/api/admin/global-entities/${id}/test`)
    return response.data
  }

  /**
   * Delete a global entity
   */
  async deleteGlobalEntity(id) {
    const response = await this.api.delete(`/api/admin/global-entities/${id}`)
    return response.data
  }
}

export { AdminRepositoryAdapter }
