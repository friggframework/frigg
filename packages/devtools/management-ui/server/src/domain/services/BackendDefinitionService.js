import { createFriggBackend } from '@friggframework/core'
import { findNearestBackendPackageJson } from '@friggframework/core/utils/index.js'
import path from 'node:path'
import fs from 'fs-extra'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * BackendDefinitionService
 * Service that loads and parses Frigg backend definitions using the same logic as frigg start
 */
export class BackendDefinitionService {
  constructor() {
    this.cache = new Map()
  }

  /**
   * Load backend definition from a specific project path
   * @param {string} projectPath - Path to the project directory
   * @returns {Promise<Object>} Backend definition with integrations and modules
   */
  async loadBackendDefinition(projectPath) {
    try {
      // Check cache first
      const cacheKey = projectPath
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)
      }

      // Find backend package.json
      const backendPath = this.findBackendPackageJson(projectPath)
      if (!backendPath) {
        throw new Error('Could not find backend package.json')
      }

      const backendDir = path.dirname(backendPath)
      const backendFilePath = path.join(backendDir, 'index.js')

      if (!fs.existsSync(backendFilePath)) {
        throw new Error('Could not find backend/index.js')
      }

      // Load the backend definition using require (since we're in a Node.js environment)
      // We need to use a dynamic require approach
      delete require.cache[require.resolve(backendFilePath)]
      const backendJsFile = require(backendFilePath)
      const appDefinition = backendJsFile.Definition

      if (!appDefinition) {
        throw new Error('No Definition found in backend/index.js')
      }

      // Create Frigg backend using the same logic as frigg start
      const backend = createFriggBackend(appDefinition)

      // Extract integration information
      const integrations = []
      const modules = []

      if (backend.integrationFactory && backend.integrationFactory.integrationClasses) {
        for (const IntegrationClass of backend.integrationFactory.integrationClasses) {
          const integration = {
            name: IntegrationClass.Definition.name,
            displayName: IntegrationClass.Definition.displayName || IntegrationClass.Definition.name,
            description: IntegrationClass.Definition.description || '',
            version: IntegrationClass.Definition.version || '1.0.0',
            routes: IntegrationClass.Definition.routes || [],
            events: IntegrationClass.Definition.events || [],
            modules: []
          }

          // Extract API modules from this integration
          console.log(`📦 Processing integration: ${integration.name}`)
          console.log(`   Has modules property:`, !!IntegrationClass.Definition.modules)

          if (IntegrationClass.Definition.modules) {
            const moduleKeys = Object.keys(IntegrationClass.Definition.modules)
            console.log(`   Module keys found:`, moduleKeys)

            // Definition.modules is an object like { primary: { definition: ModuleClass } }
            for (const [key, moduleConfig] of Object.entries(IntegrationClass.Definition.modules)) {
              console.log(`   Processing module key: ${key}`)
              console.log(`   moduleConfig:`, moduleConfig)
              console.log(`   has definition:`, !!moduleConfig?.definition)

              if (moduleConfig && moduleConfig.definition) {
                const moduleName = moduleConfig.definition.getName ? moduleConfig.definition.getName() : key
                console.log(`   Module name: ${moduleName}`)

                const moduleInfo = {
                  name: moduleName,
                  key: key,
                  integration: integration.name,
                  displayName: moduleName.replace(/([A-Z])/g, ' $1').trim(),
                  description: `API module for ${integration.name}`,
                  definition: {
                    moduleName: moduleConfig.definition.moduleName || moduleName,
                    moduleType: moduleConfig.definition.moduleType || 'unknown'
                  }
                }
                modules.push(moduleInfo)
                integration.modules.push(moduleInfo)
                console.log(`   ✅ Added module: ${moduleName}`)
              } else {
                console.log(`   ⚠️  Skipping - no definition found`)
              }
            }
          } else {
            console.log(`   ⚠️  No modules property on Definition`)
          }

          integrations.push(integration)
        }
      }

      const result = {
        appDefinition: {
          name: appDefinition.name || 'Frigg App',
          version: appDefinition.version || '1.0.0',
          path: backendDir,
          status: 'stopped', // Will be updated by runtime status
          config: {
            package: await this.loadPackageJson(backendPath),
            integrations: integrations.length,
            modules: modules.length
          }
        },
        integrations,
        modules,
        git: await this.getGitInfo(backendDir),
        structure: await this.analyzeProjectStructure(backendDir),
        environment: await this.getEnvironmentInfo(backendDir),
        runtime: null,
        isRunning: false
      }

      // Cache the result
      this.cache.set(cacheKey, result)
      return result

    } catch (error) {
      console.error('Error loading backend definition:', error)
      throw error
    }
  }

  /**
   * Find backend package.json starting from a specific path
   * @param {string} startPath - Starting directory path
   * @returns {string|null} Path to backend package.json
   */
  findBackendPackageJson(startPath) {
    // First check if we're in production by looking for package.json in the current directory
    const rootPackageJson = path.join(startPath, 'package.json')
    if (fs.existsSync(rootPackageJson)) {
      // In production environment, check for index.js in the same directory
      const indexJs = path.join(startPath, 'index.js')
      if (fs.existsSync(indexJs)) {
        return rootPackageJson
      }
    }

    // If not found at root or not in production, look for it in the backend directory
    let currentDir = startPath
    while (currentDir !== path.parse(currentDir).root) {
      const packageJsonPath = path.join(currentDir, 'backend', 'package.json')
      if (fs.existsSync(packageJsonPath)) {
        return packageJsonPath
      }
      currentDir = path.dirname(currentDir)
    }
    return null
  }

  /**
   * Load package.json information
   * @param {string} packageJsonPath - Path to package.json
   * @returns {Object} Package information
   */
  async loadPackageJson(packageJsonPath) {
    try {
      const packageData = await fs.readJson(packageJsonPath)
      return {
        name: packageData.name,
        version: packageData.version,
        scripts: packageData.scripts || {},
        dependencies: packageData.dependencies || {},
        devDependencies: packageData.devDependencies || {}
      }
    } catch (error) {
      console.error('Error loading package.json:', error)
      return {}
    }
  }

  /**
   * Get git information for the project
   * @param {string} projectPath - Path to the project
   * @returns {Object} Git information
   */
  async getGitInfo(projectPath) {
    try {
      // This would use git commands to get branch info, etc.
      // For now, return basic structure
      return {
        initialized: fs.existsSync(path.join(projectPath, '.git')),
        currentBranch: null, // Will be determined by git command when available
        branches: [],
        remotes: [],
        status: {
          modified: [],
          added: [],
          deleted: [],
          renamed: [],
          untracked: [],
          conflicted: [],
          canStash: false
        },
        hasChanges: false
      }
    } catch (error) {
      console.error('Error getting git info:', error)
      return {
        initialized: false,
        currentBranch: 'unknown',
        branches: [],
        remotes: [],
        status: { modified: [], added: [], deleted: [], renamed: [], untracked: [], conflicted: [], canStash: false },
        hasChanges: false
      }
    }
  }

  /**
   * Analyze project structure
   * @param {string} projectPath - Path to the project
   * @returns {Object} Project structure analysis
   */
  async analyzeProjectStructure(projectPath) {
    const structure = {
      directories: {},
      files: {}
    }

    const commonDirs = ['src', 'backend', 'frontend', 'test', 'config', 'docs']
    const commonFiles = ['package.json', 'README.md', 'index.js', 'frigg.config.json', '.env', '.env.example', 'Dockerfile', 'docker-compose.yml']

    // Check for common directories
    for (const dir of commonDirs) {
      const dirPath = path.join(projectPath, dir)
      structure.directories[dir] = {
        exists: fs.existsSync(dirPath),
        path: dirPath,
        isDirectory: fs.existsSync(dirPath) ? fs.statSync(dirPath).isDirectory() : false
      }
    }

    // Check for common files
    for (const file of commonFiles) {
      const filePath = path.join(projectPath, file)
      structure.files[file] = {
        exists: fs.existsSync(filePath),
        path: filePath,
        size: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
      }
    }

    return structure
  }

  /**
   * Get environment information
   * @param {string} projectPath - Path to the project
   * @returns {Object} Environment information
   */
  async getEnvironmentInfo(projectPath) {
    const envInfo = {
      variables: [],
      required: [],
      configured: [],
      missing: []
    }

    // Check for .env files
    const envFiles = ['.env', '.env.local', '.env.development', '.env.production']
    for (const envFile of envFiles) {
      const envPath = path.join(projectPath, envFile)
      if (fs.existsSync(envPath)) {
        try {
          const envContent = await fs.readFile(envPath, 'utf8')
          const lines = envContent.split('\n')
          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed && !trimmed.startsWith('#')) {
              const [key] = trimmed.split('=')
              if (key) {
                envInfo.variables.push(key)
                envInfo.configured.push(key)
              }
            }
          }
        } catch (error) {
          console.error(`Error reading ${envFile}:`, error)
        }
      }
    }

    return envInfo
  }

  /**
   * Clear cache for a specific project
   * @param {string} projectPath - Path to the project
   */
  clearCache(projectPath) {
    this.cache.delete(projectPath)
  }

  /**
   * Clear all cache
   */
  clearAllCache() {
    this.cache.clear()
  }
}
