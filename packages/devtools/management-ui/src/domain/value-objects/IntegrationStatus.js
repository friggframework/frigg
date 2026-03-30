/**
 * IntegrationStatus Value Object
 * Represents the status of an integration with validation and business rules
 */
export class IntegrationStatus {
  static STATUSES = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    ERROR: 'error',
    PENDING: 'pending',
    INSTALLING: 'installing'
  }

  constructor(status) {
    this.validateStatus(status)
    this.value = status
  }

  validateStatus(status) {
    const validStatuses = Object.values(IntegrationStatus.STATUSES)
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid integration status: ${status}. Must be one of: ${validStatuses.join(', ')}`)
    }
  }

  /**
   * Check if status is active
   */
  isActive() {
    return this.value === IntegrationStatus.STATUSES.ACTIVE
  }

  /**
   * Check if status is inactive
   */
  isInactive() {
    return this.value === IntegrationStatus.STATUSES.INACTIVE
  }

  /**
   * Check if status is error
   */
  isError() {
    return this.value === IntegrationStatus.STATUSES.ERROR
  }

  /**
   * Check if status is pending
   */
  isPending() {
    return this.value === IntegrationStatus.STATUSES.PENDING
  }

  /**
   * Check if status is installing
   */
  isInstalling() {
    return this.value === IntegrationStatus.STATUSES.INSTALLING
  }

  /**
   * Check if status is operational (active or pending)
   */
  isOperational() {
    return this.isActive() || this.isPending()
  }

  /**
   * Get display label for status
   */
  getDisplayLabel() {
    const labels = {
      [IntegrationStatus.STATUSES.ACTIVE]: 'Active',
      [IntegrationStatus.STATUSES.INACTIVE]: 'Inactive',
      [IntegrationStatus.STATUSES.ERROR]: 'Error',
      [IntegrationStatus.STATUSES.PENDING]: 'Pending',
      [IntegrationStatus.STATUSES.INSTALLING]: 'Installing'
    }
    return labels[this.value] || this.value
  }

  /**
   * Get CSS class for status
   */
  getCssClass() {
    const classes = {
      [IntegrationStatus.STATUSES.ACTIVE]: 'status-success',
      [IntegrationStatus.STATUSES.INACTIVE]: 'status-warning',
      [IntegrationStatus.STATUSES.ERROR]: 'status-error',
      [IntegrationStatus.STATUSES.PENDING]: 'status-info',
      [IntegrationStatus.STATUSES.INSTALLING]: 'status-info'
    }
    return classes[this.value] || 'status-default'
  }

  /**
   * Convert to string
   */
  toString() {
    return this.value
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return this.value
  }

  /**
   * Check equality with another status
   */
  equals(other) {
    if (other instanceof IntegrationStatus) {
      return this.value === other.value
    }
    return this.value === other
  }

  /**
   * Create from string value
   */
  static fromString(status) {
    return new IntegrationStatus(status)
  }

  /**
   * Create active status
   */
  static active() {
    return new IntegrationStatus(IntegrationStatus.STATUSES.ACTIVE)
  }

  /**
   * Create inactive status
   */
  static inactive() {
    return new IntegrationStatus(IntegrationStatus.STATUSES.INACTIVE)
  }

  /**
   * Create error status
   */
  static error() {
    return new IntegrationStatus(IntegrationStatus.STATUSES.ERROR)
  }

  /**
   * Create pending status
   */
  static pending() {
    return new IntegrationStatus(IntegrationStatus.STATUSES.PENDING)
  }

  /**
   * Create installing status
   */
  static installing() {
    return new IntegrationStatus(IntegrationStatus.STATUSES.INSTALLING)
  }
}