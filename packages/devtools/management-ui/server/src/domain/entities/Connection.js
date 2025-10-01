import { ConnectionStatus } from '../value-objects/ConnectionStatus.js'
import { Credentials } from '../value-objects/Credentials.js'
import crypto from 'crypto'

/**
 * Connection Entity
 * Represents a connection between a user and an integration
 */
export class Connection {
  constructor({
    id,
    userId,
    integrationId,
    status = ConnectionStatus.PENDING,
    credentials = null,
    metadata = {},
    createdAt = new Date(),
    updatedAt = new Date(),
    lastUsed = null,
    lastTested = null,
    lastSync = null,
    lastTestResult = null,
    lastError = null
  }) {
    this.id = id || this.generateId()
    this.userId = userId
    this.integrationId = integrationId
    this.status = status instanceof ConnectionStatus ? status : new ConnectionStatus(status)
    this.credentials = credentials instanceof Credentials
      ? credentials
      : credentials ? new Credentials(credentials) : null
    this.metadata = metadata
    this.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt)
    this.updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt)
    this.lastUsed = lastUsed ? new Date(lastUsed) : null
    this.lastTested = lastTested ? new Date(lastTested) : null
    this.lastSync = lastSync ? new Date(lastSync) : null
    this.lastTestResult = lastTestResult
    this.lastError = lastError
    this.entities = []
  }

  generateId() {
    return crypto.randomBytes(16).toString('hex')
  }

  // Domain methods
  updateCredentials(credentials) {
    this.credentials = credentials instanceof Credentials
      ? credentials
      : new Credentials(credentials)
    this.updatedAt = new Date()
  }

  activate() {
    this.status = new ConnectionStatus(ConnectionStatus.ACTIVE)
    this.updatedAt = new Date()
    this.lastError = null
  }

  deactivate() {
    this.status = new ConnectionStatus(ConnectionStatus.INACTIVE)
    this.updatedAt = new Date()
  }

  markAsError(error) {
    this.status = new ConnectionStatus(ConnectionStatus.ERROR)
    this.lastError = error
    this.updatedAt = new Date()
  }

  markAsTesting() {
    if (!this.status.canTest()) {
      throw new Error(`Cannot test connection in ${this.status.value} state`)
    }
    this.status = new ConnectionStatus(ConnectionStatus.TESTING)
  }

  recordTestResult(result) {
    this.lastTestResult = result
    this.lastTested = new Date()
    this.updatedAt = new Date()

    if (result.success) {
      this.activate()
    } else {
      this.markAsError(result.error || 'Test failed')
    }
  }

  recordUsage() {
    this.lastUsed = new Date()
    this.updatedAt = new Date()
  }

  recordSync(syncResult) {
    this.lastSync = new Date()
    this.updatedAt = new Date()
    if (!syncResult.success) {
      this.lastError = syncResult.error
    }
  }

  needsReauth() {
    return this.status.needsReauth() ||
           (this.credentials && this.credentials.isExpired() && !this.credentials.hasRefreshToken())
  }

  canSync() {
    return this.status.canSync() && this.credentials && !this.credentials.isExpired()
  }

  canTest() {
    return this.status.canTest()
  }

  isActive() {
    return this.status.isActive()
  }

  addEntity(entity) {
    this.entities.push(entity)
    this.updatedAt = new Date()
  }

  removeEntity(entityId) {
    this.entities = this.entities.filter(e => e.id !== entityId)
    this.updatedAt = new Date()
  }

  getHealthMetrics() {
    const now = Date.now()
    const createdTime = this.createdAt.getTime()
    const uptime = Math.floor((now - createdTime) / 1000)

    return {
      status: this.status.toString(),
      uptime,
      lastUsed: this.lastUsed?.toISOString(),
      lastTested: this.lastTested?.toISOString(),
      lastSync: this.lastSync?.toISOString(),
      credentialsValid: this.credentials && !this.credentials.isExpired(),
      lastError: this.lastError
    }
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      integrationId: this.integrationId,
      integration: this.integrationId, // Alias for compatibility
      status: this.status.toString(),
      credentials: this.credentials?.toSecureJSON(),
      metadata: this.metadata,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      lastUsed: this.lastUsed?.toISOString(),
      lastTested: this.lastTested?.toISOString(),
      lastSync: this.lastSync?.toISOString(),
      lastTestResult: this.lastTestResult,
      lastError: this.lastError,
      entityCount: this.entities.length
    }
  }

  static create(data) {
    if (!data.userId || !data.integrationId) {
      throw new Error('User ID and Integration ID are required')
    }
    return new Connection(data)
  }
}