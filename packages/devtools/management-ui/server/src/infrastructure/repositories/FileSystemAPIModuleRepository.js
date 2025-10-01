import fs from 'fs/promises'
import path from 'path'
import { APIModule } from '../../domain/entities/APIModule.js'

/**
 * Repository for managing API modules
 * Tracks both NPM and local API modules
 */
export class FileSystemAPIModuleRepository {
  constructor({ projectPath }) {
    this.projectPath = projectPath
    this.apiModulesPath = path.join(projectPath, 'src', 'api-modules')
    this.nodeModulesPath = path.join(projectPath, 'node_modules')
    this.cache = new Map()
  }

  async findAll() {
    const modules = []

    // Find local modules
    const localModules = await this.findLocalModules()
    modules.push(...localModules)

    // Find installed NPM modules
    const npmModules = await this.findInstalledNpmModules()
    modules.push(...npmModules)

    return modules
  }

  async findByName(name) {
    if (this.cache.has(name)) {
      return this.cache.get(name)
    }

    const all = await this.findAll()
    return all.find(m => m.name === name)
  }

  async findByPackageName(packageName) {
    const all = await this.findAll()
    return all.find(m => m.packageName === packageName)
  }

  async findLocalModules() {
    const modules = []

    try {
      await this.ensureApiModulesDirectory()
      const files = await fs.readdir(this.apiModulesPath)

      for (const file of files) {
        if (file.endsWith('.js') && !file.includes('.test.')) {
          const filePath = path.join(this.apiModulesPath, file)
          const module = await this.loadLocalModule(file, filePath)
          if (module) {
            modules.push(module)
          }
        }
      }
    } catch (error) {
      console.error('Error loading local modules:', error)
    }

    return modules
  }

  async findInstalledNpmModules() {
    const modules = []

    try {
      const packageJsonPath = path.join(this.projectPath, 'package.json')
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies }

      for (const [packageName, version] of Object.entries(dependencies)) {
        if (packageName.includes('@friggframework/api-module-')) {
          const module = await this.loadNpmModule(packageName)
          if (module) {
            modules.push(module)
          }
        }
      }
    } catch (error) {
      console.error('Error loading NPM modules:', error)
    }

    return modules
  }

  async loadLocalModule(fileName, filePath) {
    try {
      const moduleExports = await import(filePath)
      const definition = moduleExports.Definition || moduleExports.default?.Definition

      if (definition) {
        const name = fileName.replace('.js', '')
        return APIModule.createLocal(name, filePath, definition)
      }
    } catch (error) {
      console.error(`Failed to load local module from ${filePath}:`, error)
    }
    return null
  }

  async loadNpmModule(packageName) {
    try {
      const modulePath = path.join(this.nodeModulesPath, packageName)
      const packageJsonPath = path.join(modulePath, 'package.json')
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))

      // Load the module definition
      const moduleExports = await import(modulePath)
      const definition = moduleExports.Definition || moduleExports.default?.Definition

      // Try to load config
      let config = {}
      try {
        const configPath = path.join(modulePath, 'defaultConfig.json')
        config = JSON.parse(await fs.readFile(configPath, 'utf-8'))
      } catch {
        // Config is optional
      }

      const module = APIModule.createFromNpmPackage(packageJson, definition, config)
      module.markAsInstalled(packageJson.version)

      return module
    } catch (error) {
      console.error(`Failed to load NPM module ${packageName}:`, error)
    }
    return null
  }

  async save(apiModule) {
    this.cache.set(apiModule.name, apiModule)
    // For file-based modules, there's no persistence needed
    // The module definitions are in the actual module files
    return apiModule
  }

  async delete(name) {
    this.cache.delete(name)
    // We don't actually delete module files here
    // That would be handled by npm uninstall or manual deletion
    return true
  }

  async ensureApiModulesDirectory() {
    try {
      await fs.access(this.apiModulesPath)
    } catch {
      await fs.mkdir(this.apiModulesPath, { recursive: true })
    }
  }
}