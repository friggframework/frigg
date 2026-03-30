/**
 * Application service for project management
 * Handles the lifecycle of the Frigg project
 */
export class ProjectService {
  constructor({
    startProjectUseCase,
    stopProjectUseCase,
    getProjectStatusUseCase,
    initializeProjectUseCase
  }) {
    this.startProjectUseCase = startProjectUseCase
    this.stopProjectUseCase = stopProjectUseCase
    this.getProjectStatusUseCase = getProjectStatusUseCase
    this.initializeProjectUseCase = initializeProjectUseCase
  }

  async startProject(projectIdOrPath, options = {}) {
    return this.startProjectUseCase.execute(projectIdOrPath, options)
  }

  async stopProject(projectPath) {
    return this.stopProjectUseCase.execute({ projectPath })
  }

  async getStatus(projectPath) {
    return this.getProjectStatusUseCase.execute({ projectPath })
  }

  async initializeProject(params) {
    return this.initializeProjectUseCase.execute(params)
  }

  async restartProject(projectPath) {
    // Stop if running
    try {
      await this.stopProject(projectPath)
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (error) {
      // Project might not be running, that's ok
    }

    // Start the project
    return this.startProject(projectPath)
  }
}