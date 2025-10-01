/**
 * Application service for API module management
 * Handles module discovery, installation, and configuration
 */
export class APIModuleService {
  constructor({
    listAPIModulesUseCase,
    installAPIModuleUseCase,
    updateAPIModuleUseCase,
    discoverModulesUseCase
  }) {
    this.listAPIModulesUseCase = listAPIModulesUseCase
    this.installAPIModuleUseCase = installAPIModuleUseCase
    this.updateAPIModuleUseCase = updateAPIModuleUseCase
    this.discoverModulesUseCase = discoverModulesUseCase
  }

  async listModules(options = {}) {
    return this.listAPIModulesUseCase.execute(options)
  }

  async installModule(packageName, version) {
    return this.installAPIModuleUseCase.execute({ packageName, version })
  }

  async updateModule(moduleName, version) {
    return this.updateAPIModuleUseCase.execute({ moduleName, version })
  }

  async discoverModules() {
    return this.discoverModulesUseCase.execute()
  }

  async getModuleByName(name) {
    const modules = await this.listModules()
    return modules.find(m => m.name === name)
  }

  async getInstalledModules() {
    return this.listModules({ includeInstalled: true, source: 'all' })
      .then(modules => modules.filter(m => m.isInstalled))
  }

  async searchModules(query) {
    const allModules = await this.listModules()
    const lowercaseQuery = query.toLowerCase()

    return allModules.filter(module =>
      module.name.toLowerCase().includes(lowercaseQuery) ||
      module.label?.toLowerCase().includes(lowercaseQuery) ||
      module.description?.toLowerCase().includes(lowercaseQuery)
    )
  }
}