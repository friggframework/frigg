import fs from 'fs/promises'
import path from 'path'
import { Integration } from '../../domain/entities/Integration.js'

/**
 * Repository for managing integrations on the file system
 * Reads and tracks integration files in the project
 */
export class FileSystemIntegrationRepository {
  constructor({ projectPath }) {
    this.projectPath = projectPath
    this.integrationsPath = path.join(projectPath, 'src', 'integrations')
    this.cache = new Map()
  }

  async findAll() {
    try {
      await this.ensureDirectory()

      const files = await fs.readdir(this.integrationsPath)
      const integrations = []

      for (const file of files) {
        if (file.endsWith('.js') && !file.includes('.test.')) {
          const filePath = path.join(this.integrationsPath, file)
          const integration = await this.loadIntegrationFromFile(filePath)
          if (integration) {
            integrations.push(integration)
          }
        }
      }

      return integrations
    } catch (error) {
      console.error('Error loading integrations:', error)
      return []
    }
  }

  async findById(id) {
    if (this.cache.has(id)) {
      return this.cache.get(id)
    }

    const all = await this.findAll()
    return all.find(i => i.id === id)
  }

  async findByName(name) {
    const all = await this.findAll()
    return all.find(i => i.name === name)
  }

  async save(integration) {
    // Update cache
    this.cache.set(integration.id, integration)

    // If there's a path, ensure the file exists
    if (integration.path && !await this.fileExists(integration.path)) {
      // Generate the file content
      const content = integration.generateClassCode()
      await fs.writeFile(integration.path, content, 'utf-8')
    }

    return integration
  }

  async delete(id) {
    const integration = await this.findById(id)
    if (!integration) {
      throw new Error(`Integration ${id} not found`)
    }

    // Delete from cache
    this.cache.delete(id)

    // Delete the file if it exists
    if (integration.path && await this.fileExists(integration.path)) {
      await fs.unlink(integration.path)
    }

    return true
  }

  async loadIntegrationFromFile(filePath) {
    try {
      // Dynamic import to load the integration class
      const integrationModule = await import(filePath)
      const IntegrationClass = integrationModule.default || integrationModule

      if (IntegrationClass.Definition) {
        const integration = Integration.fromIntegrationClass(IntegrationClass)
        integration.path = filePath
        return integration
      }
    } catch (error) {
      console.error(`Failed to load integration from ${filePath}:`, error)
    }
    return null
  }

  async ensureDirectory() {
    try {
      await fs.access(this.integrationsPath)
    } catch {
      await fs.mkdir(this.integrationsPath, { recursive: true })
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }
}