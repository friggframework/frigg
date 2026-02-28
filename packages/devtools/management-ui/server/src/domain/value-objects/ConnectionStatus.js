/**
 * ConnectionStatus Value Object
 * Represents the possible states of a connection
 */
export class ConnectionStatus {
  static ACTIVE = 'active'
  static INACTIVE = 'inactive'
  static ERROR = 'error'
  static TESTING = 'testing'
  static PENDING = 'pending'
  static EXPIRED = 'expired'

  static values = [
    ConnectionStatus.ACTIVE,
    ConnectionStatus.INACTIVE,
    ConnectionStatus.ERROR,
    ConnectionStatus.TESTING,
    ConnectionStatus.PENDING,
    ConnectionStatus.EXPIRED
  ]

  constructor(value) {
    if (!ConnectionStatus.values.includes(value)) {
      throw new Error(`Invalid connection status: ${value}`)
    }
    this.value = value
    Object.freeze(this)
  }

  equals(other) {
    if (!(other instanceof ConnectionStatus)) return false
    return this.value === other.value
  }

  toString() {
    return this.value
  }

  isActive() {
    return this.value === ConnectionStatus.ACTIVE
  }

  needsReauth() {
    return [ConnectionStatus.ERROR, ConnectionStatus.EXPIRED].includes(this.value)
  }

  canTest() {
    return ![ConnectionStatus.TESTING, ConnectionStatus.PENDING].includes(this.value)
  }

  canSync() {
    return this.value === ConnectionStatus.ACTIVE
  }
}