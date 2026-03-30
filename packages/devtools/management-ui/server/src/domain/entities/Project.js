import { ProjectStatus } from '../value-objects/ProjectStatus.js'

/**
 * Project Entity
 * Core entity representing a Frigg project
 */
export class Project {
  constructor({
    id,
    name,
    path,
    version,
    friggCoreVersion,
    framework,
    status = ProjectStatus.STOPPED,
    port = 3000,
    environment = 'development',
    pid = null,
    startedAt = null,
    lastError = null,
    hasBackend = false,
    isMultiRepo = false,
    repositoryInfo = {}
  }) {
    this.id = id
    this.name = name
    this.path = path
    this.version = version
    this.friggCoreVersion = friggCoreVersion
    this.framework = framework
    this.status = status instanceof ProjectStatus ? status : new ProjectStatus(status)
    this.port = port
    this.environment = environment
    this.pid = pid
    this.startedAt = startedAt
    this.lastError = lastError
    this.hasBackend = hasBackend
    this.isMultiRepo = isMultiRepo
    this.repositoryInfo = repositoryInfo
    this.logs = []
    this.metrics = {
      cpu: 0,
      memory: 0,
      uptime: 0
    }
  }

  // Domain methods
  start(pid) {
    if (!this.status.canStart()) {
      throw new Error(`Cannot start project in ${this.status.value} state`)
    }
    this.status = new ProjectStatus(ProjectStatus.RUNNING)
    this.pid = pid
    this.startedAt = new Date()
    this.lastError = null
  }

  stop() {
    if (!this.status.canStop()) {
      throw new Error(`Cannot stop project in ${this.status.value} state`)
    }
    this.status = new ProjectStatus(ProjectStatus.STOPPED)
    this.pid = null
    this.startedAt = null
  }

  markAsStarting() {
    if (!this.status.canStart()) {
      throw new Error(`Cannot start project in ${this.status.value} state`)
    }
    this.status = new ProjectStatus(ProjectStatus.STARTING)
  }

  markAsStopping() {
    if (!this.status.canStop()) {
      throw new Error(`Cannot stop project in ${this.status.value} state`)
    }
    this.status = new ProjectStatus(ProjectStatus.STOPPING)
  }

  setError(error) {
    this.status = new ProjectStatus(ProjectStatus.ERROR)
    this.lastError = error
    this.pid = null
    this.startedAt = null
  }

  addLog(log) {
    this.logs.push({
      ...log,
      timestamp: new Date().toISOString()
    })
    // Keep only last 1000 logs
    if (this.logs.length > 1000) {
      this.logs.shift()
    }
  }

  updateMetrics({ cpu, memory }) {
    this.metrics.cpu = cpu
    this.metrics.memory = memory
    if (this.startedAt) {
      this.metrics.uptime = Math.floor((Date.now() - this.startedAt.getTime()) / 1000)
    }
  }

  getUptime() {
    if (!this.startedAt) return 0
    return Math.floor((Date.now() - this.startedAt.getTime()) / 1000)
  }

  isRunning() {
    return this.status.isRunning()
  }

  isStopped() {
    return this.status.isStopped()
  }

  canBeDeleted() {
    return this.status.isStopped()
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      path: this.path,
      version: this.version,
      friggCoreVersion: this.friggCoreVersion,
      framework: this.framework,
      status: this.status.toString(),
      port: this.port,
      environment: this.environment,
      pid: this.pid,
      startedAt: this.startedAt?.toISOString(),
      lastError: this.lastError,
      hasBackend: this.hasBackend,
      isMultiRepo: this.isMultiRepo,
      repositoryInfo: this.repositoryInfo,
      uptime: this.getUptime(),
      metrics: this.metrics
    }
  }

  static create(data) {
    if (!data.name || !data.path) {
      throw new Error('Project name and path are required')
    }
    return new Project(data)
  }
}