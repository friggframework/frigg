/**
 * StopProjectUseCase - Gracefully stop a running Frigg project
 *
 * Business Logic:
 * 1. Check if a process is running
 * 2. Attempt graceful shutdown (SIGTERM)
 * 3. Force kill after timeout if needed
 * 4. Clean up resources
 * 5. Return confirmation
 */
export class StopProjectUseCase {
  constructor({ processManager, webSocketService }) {
    this.processManager = processManager
    this.webSocketService = webSocketService
  }

  /**
   * Execute the use case
   * @param {object} options - Stop options
   * @param {boolean} options.force - Force immediate kill
   * @param {number} options.timeout - Timeout before force kill (default: 5000ms)
   * @returns {Promise<object>} - Stop confirmation
   */
  async execute(options = {}) {
    const { force = false, timeout = 5000 } = options

    // 1. Check if running
    if (!this.processManager.isRunning()) {
      return {
        success: true,
        isRunning: false,
        message: 'No Frigg process is currently running'
      }
    }

    // 2. Stop the process
    try {
      const result = await this.processManager.stop(force, timeout)

      // 3. Emit shutdown notification
      this.webSocketService.emit('frigg:log', {
        level: 'info',
        message: result.message,
        timestamp: new Date().toISOString(),
        source: 'process-manager'
      })

      return {
        success: true,
        ...result
      }
    } catch (error) {
      throw new Error(`Failed to stop Frigg project: ${error.message}`)
    }
  }
}
