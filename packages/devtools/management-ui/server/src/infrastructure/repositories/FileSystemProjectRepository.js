import fs from 'fs/promises'
import path from 'path'
import { createRequire } from 'node:module'
import { AppDefinition } from '../../domain/entities/AppDefinition.js'
import { ProjectStatus } from '../../domain/value-objects/ProjectStatus.js'

const require = createRequire(import.meta.url)

/**
 * Repository for managing the Frigg project configuration
 * Reads and updates the app definition and project state
 */
export class FileSystemProjectRepository {
  constructor({ projectPath }) {
    this.projectPath = projectPath
    this.appDefinitionPath = path.join(projectPath, 'src', 'app.js')
    this.configPath = path.join(projectPath, 'frigg.config.json')
    this.packageJsonPath = path.join(projectPath, 'package.json')
  }

  async findByPath(projectPath) {
    try {
      // Use the requested projectPath instead of the initialized one
      const targetPath = projectPath || this.projectPath

      console.log('FileSystemProjectRepository.findByPath called with:', projectPath)
      console.log('targetPath:', targetPath)

      // Load package.json for basic info
      const packageJson = await this.loadPackageJson(targetPath)

      // Load app definition if it exists
      let integrations = []
      const appDefinitionPath = path.join(targetPath, 'index.js') // Frigg projects use index.js
      const appJsPath = path.join(targetPath, 'app.js') // Some projects use app.js

      if (await this.fileExists(appDefinitionPath)) {
        integrations = await this.loadAppDefinitionIntegrations(targetPath, appDefinitionPath)
      } else if (await this.fileExists(appJsPath)) {
        integrations = await this.loadAppDefinitionIntegrations(targetPath, appJsPath)
      }

      // Create the AppDefinition entity with new structure
      const appDefinition = new AppDefinition({
        name: packageJson.name ? packageJson.name.replace(/[^a-z0-9-]/g, '-').toLowerCase() : null,
        label: packageJson.name || null,
        packageName: packageJson.name || null,
        version: packageJson.version || '1.0.0',
        description: packageJson.description || '',
        modules: integrations, // Use integrations as modules for now
        routes: [], // Empty routes for now
        config: {
          path: targetPath,
          integrations: integrations.length
        }
      })

      // Load any saved state (like port, process ID) - only for the original project
      if (targetPath === this.projectPath) {
        const state = await this.loadProjectState()
        if (state) {
          // Update config with state information
          appDefinition.updateConfig({
            ...appDefinition.config,
            status: state.status || 'stopped',
            processId: state.processId,
            port: state.port
          })
        }
      }

      return appDefinition
    } catch (error) {
      console.error('Error loading project:', error)
      return null
    }
  }

  async save(appDefinition) {
    // Save project state
    const state = {
      status: appDefinition.status.value,
      processId: appDefinition.processId,
      port: appDefinition.port,
      lastUpdated: new Date().toISOString()
    }

    await fs.writeFile(
      path.join(this.projectPath, '.frigg-state.json'),
      JSON.stringify(state, null, 2),
      'utf-8'
    )

    // Update app.js if needed
    if (appDefinition.integrations.length > 0) {
      await this.updateAppDefinitionFile(appDefinition)
    }

    return appDefinition
  }

  async loadPackageJson(targetPath = this.projectPath) {
    const packageJsonPath = path.join(targetPath, 'package.json')
    const content = await fs.readFile(packageJsonPath, 'utf-8')
    return JSON.parse(content)
  }

  async loadAppDefinitionIntegrations(targetPath = this.projectPath, appFilePath = null) {
    try {
      // Use the provided file path or default to index.js
      const backendFilePath = appFilePath || path.join(targetPath, 'index.js')

      if (!await this.fileExists(backendFilePath)) {
        return []
      }

      // Use require to load the backend definition
      let backendJsFile, appDefinition

      try {
        delete require.cache[require.resolve(backendFilePath)]
        backendJsFile = require(backendFilePath)
        appDefinition = backendJsFile.Definition || backendJsFile
      } catch (requireError) {
        console.error(`Could not load backend app definition: ${requireError.message}`)
        console.error(`  File: ${backendFilePath}`)
        console.error(`  This is often caused by syntax errors or missing dependencies in the user's project`)
        return []
      }

      if (!appDefinition || !appDefinition.integrations) {
        console.log(`App definition loaded but no integrations found at ${backendFilePath}`)
        return []
      }

      // Extract integration information
      const integrations = []
      for (const IntegrationClass of appDefinition.integrations) {
        if (IntegrationClass && IntegrationClass.Definition) {
          const integration = {
            name: IntegrationClass.Definition.name,
            displayName: IntegrationClass.Definition.displayName || IntegrationClass.Definition.display?.label || IntegrationClass.Definition.name,
            description: IntegrationClass.Definition.description || IntegrationClass.Definition.display?.description || '',
            version: IntegrationClass.Definition.version || '1.0.0',
            path: path.join(targetPath, 'src', 'integrations', `${IntegrationClass.Definition.name}.js`),
            modules: {}
          }

          // Extract API modules from this integration
          if (IntegrationClass.Definition.modules) {
            console.log(`📦 Processing integration: ${integration.name}`)
            console.log(`   Module keys found:`, Object.keys(IntegrationClass.Definition.modules))

            // Definition.modules is an object like { nagaris: { definition: ModuleClass }, creditorwatch: { definition: ModuleClass } }
            for (const [key, moduleConfig] of Object.entries(IntegrationClass.Definition.modules)) {
              if (moduleConfig && moduleConfig.definition) {
                const moduleName = moduleConfig.definition.getName ? moduleConfig.definition.getName() : key
                console.log(`   ✅ Adding module: ${key} -> ${moduleName}`)

                integration.modules[key] = {
                  name: moduleName,
                  key: key,
                  definition: {
                    moduleName: moduleConfig.definition.moduleName || moduleName,
                    moduleType: moduleConfig.definition.moduleType || 'unknown'
                  }
                }
              }
            }
          }

          integrations.push(integration)
        }
      }

      return integrations
    } catch (error) {
      console.error('Error loading app definition:', error)
      return []
    }
  }

  async loadProjectState() {
    try {
      const statePath = path.join(this.projectPath, '.frigg-state.json')
      if (await this.fileExists(statePath)) {
        const content = await fs.readFile(statePath, 'utf-8')
        return JSON.parse(content)
      }
    } catch (error) {
      // State file might not exist, that's ok
    }
    return null
  }

  async updateAppDefinitionFile(appDefinition) {
    // Generate the app.js content
    const integrationRequires = appDefinition.integrations
      .map(i => `const ${i.name} = require('./integrations/${i.name}');`)
      .join('\n')

    const content = `const { App } = require('@friggframework/core');

${integrationRequires}

class FriggApp extends App {
  static Definition = {
    name: '${appDefinition.name}',
    version: '${appDefinition.version}',
    integrations: [
      ${appDefinition.integrations.map(i => i.name).join(',\n      ')}
    ]
  };

  constructor(config) {
    super(config);
  }
}

module.exports = FriggApp;
`

    await fs.writeFile(this.appDefinitionPath, content, 'utf-8')
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