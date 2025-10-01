/**
 * ProjectStatus Value Object
 * Represents the possible states of a Frigg project
 */
export class ProjectStatus {
  static STOPPED = 'stopped'
  static STARTING = 'starting'
  static RUNNING = 'running'
  static STOPPING = 'stopping'
  static ERROR = 'error'

  static values = [
    ProjectStatus.STOPPED,
    ProjectStatus.STARTING,
    ProjectStatus.RUNNING,
    ProjectStatus.STOPPING,
    ProjectStatus.ERROR
  ]

  constructor(value) {
    if (!ProjectStatus.values.includes(value)) {
      throw new Error(`Invalid project status: ${value}`)
    }
    this.value = value
    Object.freeze(this)
  }

  equals(other) {
    if (!(other instanceof ProjectStatus)) return false
    return this.value === other.value
  }

  toString() {
    return this.value
  }

  isRunning() {
    return this.value === ProjectStatus.RUNNING
  }

  isStopped() {
    return this.value === ProjectStatus.STOPPED
  }

  isTransitioning() {
    return [ProjectStatus.STARTING, ProjectStatus.STOPPING].includes(this.value)
  }

  canStart() {
    return [ProjectStatus.STOPPED, ProjectStatus.ERROR].includes(this.value)
  }

  canStop() {
    return this.value === ProjectStatus.RUNNING
  }
}