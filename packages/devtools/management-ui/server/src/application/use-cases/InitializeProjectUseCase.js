/**
 * Use case for initializing a new project
 * Sets up the basic project structure and configuration
 */
export class InitializeProjectUseCase {
  constructor({ projectRepository, friggCliAdapter, configValidator }) {
    this.projectRepository = projectRepository
    this.friggCliAdapter = friggCliAdapter
    this.configValidator = configValidator
  }

  async execute({ projectPath, name, template = 'basic' }) {
    // Validate project path exists
    if (!projectPath) {
      throw new Error('Project path is required')
    }

    // Check if project already exists
    const existingProject = await this.projectRepository.findByPath(projectPath)
    if (existingProject && existingProject.isInitialized) {
      throw new Error(`Project already initialized at ${projectPath}`)
    }

    // Initialize project using Frigg CLI
    const initResult = await this.friggCliAdapter.initProject({
      path: projectPath,
      name,
      template
    })

    if (!initResult.success) {
      throw new Error(`Failed to initialize project: ${initResult.error}`)
    }

    // Validate the generated configuration
    const configValidation = await this.configValidator.validateProject(projectPath)
    if (!configValidation.isValid) {
      throw new Error(`Invalid project configuration: ${configValidation.errors.join(', ')}`)
    }

    // Create or update project record
    const project = {
      name: name || 'Unnamed Project',
      path: projectPath,
      template,
      isInitialized: true,
      createdAt: new Date(),
      config: initResult.config
    }

    await this.projectRepository.save(project)

    return {
      success: true,
      project,
      files: initResult.files || [],
      message: `Project ${name} initialized successfully at ${projectPath}`
    }
  }
}