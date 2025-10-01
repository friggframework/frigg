/**
 * IntegrationStatus Value Object
 * Represents the possible states of an integration
 */
export class IntegrationStatus {
  static AVAILABLE = 'available'
  static INSTALLED = 'installed'
  static ACTIVE = 'active'
  static ERROR = 'error'
  static INSTALLING = 'installing'
  static REMOVING = 'removing'

  static values = [
    IntegrationStatus.AVAILABLE,
    IntegrationStatus.INSTALLED,
    IntegrationStatus.ACTIVE,
    IntegrationStatus.ERROR,
    IntegrationStatus.INSTALLING,
    IntegrationStatus.REMOVING
  ]

  constructor(value) {
    if (!IntegrationStatus.values.includes(value)) {
      throw new Error(`Invalid integration status: ${value}`)
    }
    this.value = value
    Object.freeze(this)
  }

  equals(other) {
    if (!(other instanceof IntegrationStatus)) return false
    return this.value === other.value
  }

  toString() {
    return this.value
  }

  isInstalled() {
    return [IntegrationStatus.INSTALLED, IntegrationStatus.ACTIVE].includes(this.value)
  }

  isActive() {
    return this.value === IntegrationStatus.ACTIVE
  }

  canInstall() {
    return this.value === IntegrationStatus.AVAILABLE
  }

  canRemove() {
    return [IntegrationStatus.INSTALLED, IntegrationStatus.ERROR].includes(this.value)
  }

  isTransitioning() {
    return [IntegrationStatus.INSTALLING, IntegrationStatus.REMOVING].includes(this.value)
  }
}