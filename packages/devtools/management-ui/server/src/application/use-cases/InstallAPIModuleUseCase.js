import { APIModule } from '../../domain/entities/APIModule.js'

/**
 * Use case for installing an API module using Frigg CLI
 * Leverages the existing Frigg CLI code for module management
 */
export class InstallAPIModuleUseCase {
  constructor({ apiModuleRepository, friggCliAdapter }) {
    this.apiModuleRepository = apiModuleRepository
    this.friggCliAdapter = friggCliAdapter
  }

  async execute({ packageName, version }) {
    // Check if already installed
    const existingModule = await this.apiModuleRepository.findByPackageName(packageName)
    if (existingModule?.isInstalled) {
      throw new Error(`Module ${packageName} is already installed`)
    }

    // Use Frigg CLI to install the module
    const installResult = await this.friggCliAdapter.installModule(packageName, version)

    // Load the module Definition after installation
    const moduleDefinition = await this.friggCliAdapter.loadModuleDefinition(packageName)
    const moduleConfig = await this.friggCliAdapter.getModuleConfig(packageName)

    // Create the APIModule entity
    const apiModule = APIModule.createFromNpmPackage(
      {
        name: packageName,
        version: installResult.version || version
      },
      moduleDefinition,
      moduleConfig
    )

    apiModule.markAsInstalled(installResult.version)

    // Save to repository (which tracks what modules are available)
    await this.apiModuleRepository.save(apiModule)

    return apiModule
  }
}