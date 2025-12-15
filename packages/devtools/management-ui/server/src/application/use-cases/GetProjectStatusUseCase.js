/**
 * Use case for getting the current project status
 * Provides information about the running Frigg instance
 *
 * Note: The ProcessManager singleton is the source of truth for running process state.
 * The projectRepository is used for project metadata, but process state comes from ProcessManager.
 */
export class GetProjectStatusUseCase {
  constructor({ projectRepository, processManager }) {
    this.projectRepository = projectRepository
    this.processManager = processManager
  }

  async execute({ projectPath }) {
    // Get the current project metadata
    const project = await this.projectRepository.findByPath(projectPath)
    if (!project) {
      throw new Error(`Project not found at ${projectPath}`)
    }

    // Get runtime info from the ProcessManager singleton
    // ProcessManager tracks the actual running process state
    const processStatus = this.processManager.getStatus()

    // Build runtime info if process is running
    let runtimeInfo = null
    if (processStatus.isRunning) {
      runtimeInfo = {
        pid: processStatus.pid,
        port: processStatus.port,
        startedAt: processStatus.startTime,
        uptime: processStatus.uptime,
        repositoryPath: processStatus.repositoryPath
      }
    }

    return {
      project: project.toJSON(),
      runtimeInfo
    }
  }
}