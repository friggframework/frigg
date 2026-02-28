/**
 * AdminUser Entity
 * Represents a user in the admin context with organization association
 */
class AdminUser {
  constructor({
    id,
    username,
    email,
    organizationUserId = null,
    organizationName = null,
    createdAt = null,
    __t = 'IndividualUser'
  }) {
    if (!username && !email) {
      throw new Error('AdminUser must have either username or email')
    }

    this.id = id
    this.username = username
    this.email = email
    this.organizationUserId = organizationUserId
    this.organizationName = organizationName
    this.createdAt = createdAt ? new Date(createdAt) : null
    this.type = __t
  }

  /**
   * Get display name for the user
   */
  getDisplayName() {
    return this.username || this.email
  }

  /**
   * Get display name with organization
   */
  getDisplayNameWithOrg() {
    const name = this.getDisplayName()
    if (this.organizationName) {
      return `${name} (${this.organizationName})`
    }
    return name
  }

  /**
   * Check if user has an associated organization
   */
  hasOrganization() {
    return Boolean(this.organizationUserId)
  }

  /**
   * Create from API response
   */
  static fromApiResponse(data) {
    return new AdminUser({
      id: data._id || data.id,
      username: data.username,
      email: data.email,
      organizationUserId: data.organizationUser,
      organizationName: data.organizationName,
      createdAt: data.createdAt,
      __t: data.__t
    })
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return {
      id: this.id,
      username: this.username,
      email: this.email,
      organizationUserId: this.organizationUserId,
      organizationName: this.organizationName,
      createdAt: this.createdAt,
      type: this.type
    }
  }
}

export { AdminUser }
