/**
 * GlobalEntity Entity
 * Represents a global entity (app owner's connected account)
 * These are shared across all users for specific integrations
 */
class GlobalEntity {
  constructor({
    id,
    type,
    name,
    status = 'connected',
    isGlobal = true,
    createdAt = null,
    updatedAt = null
  }) {
    if (!type) {
      throw new Error('GlobalEntity must have a type')
    }

    this.id = id
    this.type = type
    this.name = name || `Global ${type}`
    this.status = status
    this.isGlobal = isGlobal
    this.createdAt = createdAt ? new Date(createdAt) : null
    this.updatedAt = updatedAt ? new Date(updatedAt) : null
  }

  /**
   * Check if entity is connected
   */
  isConnected() {
    return this.status === 'connected'
  }

  /**
   * Check if entity is global
   */
  isGlobalEntity() {
    return this.isGlobal === true
  }

  /**
   * Get display name
   */
  getDisplayName() {
    return this.name || this.type
  }

  /**
   * Get status badge variant
   */
  getStatusVariant() {
    switch (this.status) {
      case 'connected':
        return 'success'
      case 'error':
        return 'destructive'
      case 'pending':
        return 'warning'
      default:
        return 'secondary'
    }
  }

  /**
   * Create from API response
   */
  static fromApiResponse(data) {
    return new GlobalEntity({
      id: data._id || data.id,
      type: data.type,
      name: data.name,
      status: data.status,
      isGlobal: data.isGlobal,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    })
  }

  /**
   * Convert to plain object for API requests
   */
  toObject() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      status: this.status,
      isGlobal: this.isGlobal,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }

  /**
   * Convert to creation payload
   */
  toCreatePayload(credentials) {
    return {
      entityType: this.type,
      name: this.name,
      credentials
    }
  }
}

export { GlobalEntity }
