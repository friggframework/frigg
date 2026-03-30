import { ServiceStatus } from '../../domain/value-objects/ServiceStatus.js'

/**
 * GetProjectStatusUseCase
 * Orchestrates the retrieval of project status
 */
export class GetProjectStatusUseCase {
  constructor(projectRepository) {
    this.projectRepository = projectRepository
  }

  /**
   * Execute the use case
   * @returns {Promise<{status: ServiceStatus, environment: string}>}
   */
  async execute() {
    try {
      const statusData = await this.projectRepository.getStatus()

      // Convert to domain value object and apply business rules
      const status = new ServiceStatus(statusData.status || ServiceStatus.STATUSES.STOPPED)

      return {
        status,
        environment: statusData.environment || 'local'
      }
    } catch (error) {
      // Return error status if we can't get the status
      return {
        status: ServiceStatus.error(),
        environment: 'unknown'
      }
    }
  }
}