/**
 * ServiceStatus Value Object
 * Represents the status of the Frigg service with validation and business rules
 */
export class ServiceStatus {
  static STATUSES = {
    RUNNING: 'running',
    STOPPED: 'stopped',
    STARTING: 'starting',
    STOPPING: 'stopping',
    ERROR: 'error'
  }

  constructor(status) {
    this.validateStatus(status)
    this.value = status
  }

  validateStatus(status) {
    const validStatuses = Object.values(ServiceStatus.STATUSES)
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid service status: ${status}. Must be one of: ${validStatuses.join(', ')}`)
    }
  }

  /**
   * Check if service is running
   */
  isRunning() {
    return this.value === ServiceStatus.STATUSES.RUNNING
  }

  /**
   * Check if service is stopped
   */
  isStopped() {
    return this.value === ServiceStatus.STATUSES.STOPPED
  }

  /**
   * Check if service is starting
   */
  isStarting() {
    return this.value === ServiceStatus.STATUSES.STARTING
  }

  /**
   * Check if service is stopping
   */
  isStopping() {
    return this.value === ServiceStatus.STATUSES.STOPPING
  }

  /**
   * Check if service has error
   */
  isError() {
    return this.value === ServiceStatus.STATUSES.ERROR
  }

  /**
   * Check if service is in transition state
   */
  isTransitioning() {
    return this.isStarting() || this.isStopping()
  }

  /**
   * Check if service is operational
   */
  isOperational() {
    return this.isRunning() || this.isTransitioning()
  }

  /**
   * Check if action is allowed
   */
  canStart() {
    return this.isStopped() || this.isError()
  }

  canStop() {
    return this.isRunning() || this.isStarting()
  }

  canRestart() {
    return !this.isTransitioning()
  }

  /**
   * Get display label for status
   */
  getDisplayLabel() {
    const labels = {
      [ServiceStatus.STATUSES.RUNNING]: 'Running',
      [ServiceStatus.STATUSES.STOPPED]: 'Stopped',
      [ServiceStatus.STATUSES.STARTING]: 'Starting',
      [ServiceStatus.STATUSES.STOPPING]: 'Stopping',
      [ServiceStatus.STATUSES.ERROR]: 'Error'
    }
    return labels[this.value] || this.value
  }

  /**
   * Get CSS class for status
   */
  getCssClass() {
    const classes = {
      [ServiceStatus.STATUSES.RUNNING]: 'status-success',
      [ServiceStatus.STATUSES.STOPPED]: 'status-error',
      [ServiceStatus.STATUSES.STARTING]: 'status-warning',
      [ServiceStatus.STATUSES.STOPPING]: 'status-warning',
      [ServiceStatus.STATUSES.ERROR]: 'status-error'
    }
    return classes[this.value] || 'status-default'
  }

  /**
   * Get color for status
   */
  getColor() {
    const colors = {
      [ServiceStatus.STATUSES.RUNNING]: 'green',
      [ServiceStatus.STATUSES.STOPPED]: 'red',
      [ServiceStatus.STATUSES.STARTING]: 'yellow',
      [ServiceStatus.STATUSES.STOPPING]: 'yellow',
      [ServiceStatus.STATUSES.ERROR]: 'red'
    }
    return colors[this.value] || 'gray'
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
    if (other instanceof ServiceStatus) {
      return this.value === other.value
    }
    return this.value === other
  }

  /**
   * Create from string value
   */
  static fromString(status) {
    return new ServiceStatus(status)
  }

  /**
   * Create running status
   */
  static running() {
    return new ServiceStatus(ServiceStatus.STATUSES.RUNNING)
  }

  /**
   * Create stopped status
   */
  static stopped() {
    return new ServiceStatus(ServiceStatus.STATUSES.STOPPED)
  }

  /**
   * Create starting status
   */
  static starting() {
    return new ServiceStatus(ServiceStatus.STATUSES.STARTING)
  }

  /**
   * Create stopping status
   */
  static stopping() {
    return new ServiceStatus(ServiceStatus.STATUSES.STOPPING)
  }

  /**
   * Create error status
   */
  static error() {
    return new ServiceStatus(ServiceStatus.STATUSES.ERROR)
  }
}