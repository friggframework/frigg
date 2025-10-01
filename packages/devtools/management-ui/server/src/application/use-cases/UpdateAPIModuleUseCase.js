/**
 * Use case for updating an API module
 * Handles upgrading to new versions and updating configuration
 */
export class UpdateAPIModuleUseCase {
  constructor({ apiModuleRepository, friggCliAdapter }) {
    this.apiModuleRepository = apiModuleRepository
    this.friggCliAdapter = friggCliAdapter
  }

  async execute({ moduleName, version, updateConfig = false }) {
    // Find the existing module
    const module = await this.apiModuleRepository.findByName(moduleName)
    if (!module) {
      throw new Error(`API Module ${moduleName} not found`)
    }

    if (!module.isInstalled) {
      throw new Error(`API Module ${moduleName} is not installed`)
    }

    // Check if version is different
    if (version && module.version === version) {
      return {
        success: true,
        module,
        message: `Module ${moduleName} is already at version ${version}`
      }
    }

    // Get available versions if version not specified
    const availableVersions = await this.friggCliAdapter.getModuleVersions(moduleName)
    const targetVersion = version || availableVersions.latest

    if (!availableVersions.versions.includes(targetVersion)) {
      throw new Error(`Version ${targetVersion} not available for module ${moduleName}`)
    }

    // Update the module using Frigg CLI
    const updateResult = await this.friggCliAdapter.updateModule({
      name: moduleName,
      version: targetVersion,
      updateConfig
    })

    if (!updateResult.success) {
      throw new Error(`Failed to update module ${moduleName}: ${updateResult.error}`)
    }

    // Update module record
    const updatedModule = {
      ...module,
      version: targetVersion,
      updatedAt: new Date(),
      changelog: updateResult.changelog || [],
      config: updateConfig ? updateResult.config : module.config
    }

    await this.apiModuleRepository.save(updatedModule)

    return {
      success: true,
      module: updatedModule,
      previousVersion: module.version,
      newVersion: targetVersion,
      changelog: updateResult.changelog || [],
      message: `Module ${moduleName} updated from ${module.version} to ${targetVersion}`
    }
  }
}