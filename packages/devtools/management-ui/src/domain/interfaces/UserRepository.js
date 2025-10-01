/**
 * UserRepository Interface (Port)
 * Defines the contract for user data access
 */
export class UserRepository {
  /**
   * Get all users
   * @returns {Promise<User[]>}
   */
  async getAll() {
    throw new Error('Method getAll must be implemented')
  }

  /**
   * Get user by ID
   * @param {string} userId
   * @returns {Promise<User|null>}
   */
  async getById(userId) {
    throw new Error('Method getById must be implemented')
  }

  /**
   * Create new user
   * @param {Object} userData
   * @returns {Promise<User>}
   */
  async create(userData) {
    throw new Error('Method create must be implemented')
  }

  /**
   * Update user
   * @param {string} userId
   * @param {Object} userData
   * @returns {Promise<User>}
   */
  async update(userId, userData) {
    throw new Error('Method update must be implemented')
  }

  /**
   * Delete user
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  async delete(userId) {
    throw new Error('Method delete must be implemented')
  }

  /**
   * Bulk create users
   * @param {number} count
   * @returns {Promise<User[]>}
   */
  async bulkCreate(count) {
    throw new Error('Method bulkCreate must be implemented')
  }

  /**
   * Delete all users
   * @returns {Promise<boolean>}
   */
  async deleteAll() {
    throw new Error('Method deleteAll must be implemented')
  }
}