import { ProjectStatus } from '../../domain/value-objects/ProjectStatus.js'

/**
 * Use case for getting the current project status
 * Provides information about the running Frigg instance
 */
export class GetProjectStatusUseCase {
  constructor({ projectRepository, processManager }) {
    this.projectRepository = projectRepository
    this.processManager = processManager
  }

  async execute({ projectPath }) {
    // Get the current project
    const project = await this.projectRepository.findByPath(projectPath)
    if (!project) {
      throw new Error(`Project not found at ${projectPath}`)
    }

    // If project is supposedly running, verify the process is actually alive
    if (project.processId) {
      const isAlive = await this.processManager.isProcessRunning(project.processId)
      if (!isAlive) {
        // Process died, update status
        project.status = new ProjectStatus(ProjectStatus.STOPPED)
        project.processId = null
        await this.projectRepository.save(project)
      }
    }

    // Get additional runtime info if running
    let runtimeInfo = null
    if (project.status?.value === ProjectStatus.RUNNING && project.processId) {
      runtimeInfo = await this.processManager.getProcessInfo(project.processId)
    }

    return {
      project: project.toJSON(),
      runtimeInfo
    }
  }
}