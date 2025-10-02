import { AdminUser } from '../../domain/entities/AdminUser.js'
import { GlobalEntity } from '../../domain/entities/GlobalEntity.js'

/**
 * AdminService
 * Application service for admin operations
 * Orchestrates domain logic and repository interactions
 */
class AdminService {
  constructor(adminRepository) {
    if (!adminRepository) {
      throw new Error('AdminService requires an adminRepository')
    }
    this.adminRepository = adminRepository
  }

  /**
   * List users with pagination
   */
  async listUsers(options = {}) {
    const {
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options

    const result = await this.adminRepository.listUsers({
      page,
      limit,
      sortBy,
      sortOrder
    })

    return {
      users: result.users.map(u => AdminUser.fromApiResponse(u)),
      pagination: result.pagination
    }
  }

  /**
   * Search users by query
   */
  async searchUsers(query, options = {}) {
    if (!query || query.trim() === '') {
      throw new Error('Search query is required')
    }

    const {
      page = 1,
      limit = 50
    } = options

    const result = await this.adminRepository.searchUsers(query, {
      page,
      limit
    })

    return {
      users: result.users.map(u => AdminUser.fromApiResponse(u)),
      pagination: result.pagination,
      query
    }
  }

  /**
   * Create a new user
   * Validates input and delegates to repository
   */
  async createUser(userData) {
    const { username, password, email } = userData

    // Validation
    if (!username && !email) {
      throw new Error('Username or email is required')
    }

    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters')
    }

    // Create user via repository
    const createdUser = await this.adminRepository.createUser({
      username,
      password,
      email
    })

    return AdminUser.fromApiResponse(createdUser)
  }

  /**
   * Delete a user by ID
   * Validates ID and delegates to repository
   */
  async deleteUser(userId) {
    if (!userId) {
      throw new Error('User ID is required')
    }

    return await this.adminRepository.deleteUser(userId)
  }

  /**
   * List all global entities
   */
  async listGlobalEntities() {
    const entities = await this.adminRepository.listGlobalEntities()
    return entities.map(e => GlobalEntity.fromApiResponse(e))
  }

  /**
   * Get a specific global entity
   */
  async getGlobalEntity(id) {
    if (!id) {
      throw new Error('Entity ID is required')
    }

    const entity = await this.adminRepository.getGlobalEntity(id)
    return GlobalEntity.fromApiResponse(entity)
  }

  /**
   * Create a global entity
   */
  async createGlobalEntity(entityData) {
    const { entityType, credentials, name } = entityData

    // Validation
    if (!entityType) {
      throw new Error('Entity type is required')
    }

    if (!credentials || Object.keys(credentials).length === 0) {
      throw new Error('Credentials are required')
    }

    // Create entity via repository
    const createdEntity = await this.adminRepository.createGlobalEntity({
      entityType,
      credentials,
      name: name || `Global ${entityType}`
    })

    return GlobalEntity.fromApiResponse(createdEntity)
  }

  /**
   * Test a global entity connection
   */
  async testGlobalEntity(id) {
    if (!id) {
      throw new Error('Entity ID is required')
    }

    return await this.adminRepository.testGlobalEntity(id)
  }

  /**
   * Delete a global entity
   */
  async deleteGlobalEntity(id) {
    if (!id) {
      throw new Error('Entity ID is required')
    }

    return await this.adminRepository.deleteGlobalEntity(id)
  }

  /**
   * Get statistics about users and entities
   */
  async getAdminStats() {
    // This could be expanded to call specific stats endpoints
    const [usersResult, entities] = await Promise.all([
      this.listUsers({ page: 1, limit: 1 }),
      this.listGlobalEntities()
    ])

    return {
      totalUsers: usersResult.pagination?.total || 0,
      totalGlobalEntities: entities.length,
      connectedGlobalEntities: entities.filter(e => e.isConnected()).length
    }
  }
}

export { AdminService }
