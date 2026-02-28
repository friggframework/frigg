/**
 * User Entity
 * Represents a user in the system with business logic and validation
 */
export class User {
  constructor(data) {
    this.id = data.id
    this.name = data.name
    this.email = data.email
    this.role = data.role || 'user'
    this.isActive = data.isActive !== undefined ? data.isActive : true
    this.createdAt = data.createdAt || new Date()
    this.updatedAt = data.updatedAt || new Date()
    this.lastLoginAt = data.lastLoginAt || null
    this.preferences = data.preferences || {}
  }

  /**
   * Check if user is active
   * @returns {boolean}
   */
  isActive() {
    return this.isActive
  }

  /**
   * Check if user has admin role
   * @returns {boolean}
   */
  isAdmin() {
    return this.role === 'admin'
  }

  /**
   * Update user profile
   * @param {Object} updates
   */
  updateProfile(updates) {
    if (updates.name) {
      this.name = updates.name
    }
    if (updates.email) {
      this.email = updates.email
    }
    if (updates.preferences) {
      this.preferences = { ...this.preferences, ...updates.preferences }
    }
    this.updatedAt = new Date()
  }

  /**
   * Update user role
   * @param {string} role
   */
  updateRole(role) {
    if (!['user', 'admin', 'viewer'].includes(role)) {
      throw new Error('Invalid role. Must be user, admin, or viewer')
    }
    this.role = role
    this.updatedAt = new Date()
  }

  /**
   * Activate user
   */
  activate() {
    this.isActive = true
    this.updatedAt = new Date()
  }

  /**
   * Deactivate user
   */
  deactivate() {
    this.isActive = false
    this.updatedAt = new Date()
  }

  /**
   * Record login
   */
  recordLogin() {
    this.lastLoginAt = new Date()
    this.updatedAt = new Date()
  }

  /**
   * Get user display name
   * @returns {string}
   */
  getDisplayName() {
    return this.name || this.email
  }

  /**
   * Validate user data
   * @returns {boolean}
   */
  isValid() {
    return !!(this.id && this.email && this.name)
  }

  /**
   * Convert to plain object
   * @returns {Object}
   */
  /**
   * Convert to plain object (alias for toJSON)
   * @returns {Object}
   */
  toObject() {
    return this.toJSON()
  }
}
