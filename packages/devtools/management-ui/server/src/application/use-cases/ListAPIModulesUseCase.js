/**
 * Use case for listing all available API modules
 * Orchestrates the retrieval of API modules from both NPM and local sources
 */
export class ListAPIModulesUseCase {
  constructor({ apiModuleRepository, npmAdapter }) {
    this.apiModuleRepository = apiModuleRepository
    this.npmAdapter = npmAdapter
  }

  async execute({ includeInstalled = true, source = 'all' }) {
    const modules = []

    // Get NPM modules if requested
    if (source === 'all' || source === 'npm') {
      const npmModules = await this.npmAdapter.searchFriggModules()
      modules.push(...npmModules)
    }

    // Get local modules if requested
    if (source === 'all' || source === 'local') {
      const localModules = await this.apiModuleRepository.findLocalModules()
      modules.push(...localModules)
    }

    // Filter by installation status if needed
    if (!includeInstalled) {
      return modules.filter(m => !m.isInstalled)
    }

    return modules
  }
}