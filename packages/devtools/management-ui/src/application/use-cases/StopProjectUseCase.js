import { ServiceStatus } from '../../domain/value-objects/ServiceStatus.js'

/**
 * StopProjectUseCase
 * Orchestrates stopping the Frigg project
 */
export class StopProjectUseCase {
  constructor(projectRepository) {
    this.projectRepository = projectRepository
  }

  /**
   * Execute the use case
   * @param {boolean} force - Force stop flag
   * @returns {Promise<void>}
   */
  async execute(force = false) {
    try {
      // Get current status to validate if stop is allowed
      if (!force) {
        const statusData = await this.projectRepository.getStatus()
        const currentStatus = new ServiceStatus(statusData.status || ServiceStatus.STATUSES.STOPPED)

        if (!currentStatus.canStop()) {
          throw new Error(`Cannot stop project. Current status: ${currentStatus.getDisplayLabel()}`)
        }
      }

      // Stop the project
      await this.projectRepository.stop(force)
    } catch (error) {
      throw new Error(`Failed to stop project: ${error.message}`)
    }
  }
}