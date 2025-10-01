/**
 * Use case for discovering available API modules
 * Searches for modules in registry, local files, and recommendations
 */
export class DiscoverModulesUseCase {
  constructor({ apiModuleRepository, friggCliAdapter }) {
    this.apiModuleRepository = apiModuleRepository
    this.friggCliAdapter = friggCliAdapter
  }

  async execute({ category, tags = [], searchTerm, includeInstalled = true }) {
    // Get modules from registry
    const registryModules = await this.friggCliAdapter.searchModules({
      category,
      tags,
      searchTerm
    })

    // Get locally installed modules if requested
    let installedModules = []
    if (includeInstalled) {
      installedModules = await this.apiModuleRepository.findAll()
    }

    // Combine and categorize results
    const discovered = {
      registry: registryModules.map(module => ({
        ...module,
        source: 'registry',
        isInstalled: installedModules.some(installed => installed.name === module.name)
      })),
      installed: installedModules.map(module => ({
        ...module,
        source: 'local',
        isInstalled: true
      })),
      recommendations: []
    }

    // Generate recommendations based on current integrations
    try {
      const recommendations = await this.generateRecommendations(installedModules)
      discovered.recommendations = recommendations
    } catch (error) {
      console.warn('Failed to generate recommendations:', error.message)
    }

    // Filter and sort results
    const filtered = this.filterAndSort(discovered, { category, tags, searchTerm })

    return {
      success: true,
      modules: filtered,
      total: filtered.registry.length + filtered.installed.length + filtered.recommendations.length,
      filters: {
        category,
        tags,
        searchTerm,
        includeInstalled
      }
    }
  }

  async generateRecommendations(installedModules) {
    if (installedModules.length === 0) {
      return this.getStarterRecommendations()
    }

    // Analyze installed modules to suggest complementary ones
    const categories = [...new Set(installedModules.map(m => m.category))]
    const recommendations = []

    for (const category of categories) {
      const related = await this.friggCliAdapter.getRelatedModules(category)
      recommendations.push(...related.filter(r =>
        !installedModules.some(installed => installed.name === r.name)
      ))
    }

    return recommendations.slice(0, 5).map(module => ({
      ...module,
      source: 'recommendation',
      reason: `Works well with your ${module.category} modules`
    }))
  }

  getStarterRecommendations() {
    return [
      {
        name: 'database',
        description: 'Database integration module',
        category: 'data',
        source: 'recommendation',
        reason: 'Essential for most applications'
      },
      {
        name: 'auth',
        description: 'Authentication and authorization',
        category: 'security',
        source: 'recommendation',
        reason: 'Security foundation for applications'
      },
      {
        name: 'logging',
        description: 'Structured logging and monitoring',
        category: 'observability',
        source: 'recommendation',
        reason: 'Important for production applications'
      }
    ]
  }

  filterAndSort(discovered, filters) {
    const { category, tags, searchTerm } = filters

    const filterModule = (module) => {
      if (category && module.category !== category) return false
      if (tags.length > 0 && !tags.some(tag => module.tags?.includes(tag))) return false
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        return module.name.toLowerCase().includes(term) ||
               module.description?.toLowerCase().includes(term)
      }
      return true
    }

    return {
      registry: discovered.registry.filter(filterModule).sort((a, b) => a.name.localeCompare(b.name)),
      installed: discovered.installed.filter(filterModule).sort((a, b) => a.name.localeCompare(b.name)),
      recommendations: discovered.recommendations.filter(filterModule)
    }
  }
}