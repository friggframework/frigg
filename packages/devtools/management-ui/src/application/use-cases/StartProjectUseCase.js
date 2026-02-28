import { ServiceStatus } from '../../domain/value-objects/ServiceStatus.js'

/**
 * StartProjectUseCase
 * Orchestrates starting the Frigg project
 */
export class StartProjectUseCase {
  constructor(projectRepository) {
    this.projectRepository = projectRepository
  }

  /**
   * Execute the use case
   * @param {Object} options - Start options
   * @returns {Promise<void>}
   */
  async execute(options = {}) {
    try {
      // Get current status to validate if start is allowed
      const statusData = await this.projectRepository.getStatus()
      const currentStatus = new ServiceStatus(statusData.status || ServiceStatus.STATUSES.STOPPED)

      if (!currentStatus.canStart()) {
        throw new Error(`Cannot start project. Current status: ${currentStatus.getDisplayLabel()}`)
      }

      // Validate start options
      this.validateStartOptions(options)

      // Start the project
      await this.projectRepository.start(options)
    } catch (error) {
      throw new Error(`Failed to start project: ${error.message}`)
    }
  }

  /**
   * Validate start options
   * @param {Object} options
   */
  validateStartOptions(options) {
    if (options.stage && !['dev', 'staging', 'prod'].includes(options.stage)) {
      throw new Error('Invalid stage option. Must be one of: dev, staging, prod')
    }

    if (options.verbose !== undefined && typeof options.verbose !== 'boolean') {
      throw new Error('Verbose option must be a boolean')
    }
  }
}