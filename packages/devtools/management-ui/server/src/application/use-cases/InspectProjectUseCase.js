import fs from 'fs/promises'
import path from 'path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * Use case for deep inspection of a Frigg project
 * Returns complete nested structure: appDefinition → integrations → modules
 */
export class InspectProjectUseCase {
  constructor({
    fileSystemProjectRepository,
    gitAdapter
  }) {
    this.projectRepo = fileSystemProjectRepository
    this.gitAdapter = gitAdapter
  }

  async execute({ projectPath }) {
    console.log('InspectProjectUseCase.execute called with projectPath:', projectPath)
    console.log('this.projectRepo:', !!this.projectRepo)

    // Load base project definition
    const appDefinition = await this.projectRepo.findByPath(projectPath)

    if (!appDefinition) {
      throw new Error(`No Frigg project found at ${projectPath}`)
    }

    // Load complete nested structure
    const config = await this.loadProjectConfig(projectPath)

    const inspection = {
      appDefinition: {
        name: appDefinition.name,
        label: config.label || appDefinition.label,  // Add label at top level for frontend access
        version: appDefinition.version,
        description: appDefinition.description,
        path: projectPath,
        status: appDefinition.status?.value || 'stopped',
        config,
        // IMPORTANT: Include integrations in appDefinition for frontend compatibility
        integrations: appDefinition.modules || []
      },
      // ALSO include at top level for direct access
      integrations: appDefinition.modules || [],
      modules: await this.loadAllModules(projectPath),
      git: await this.loadGitStatus(projectPath),
      structure: await this.analyzeProjectStructure(projectPath),
      environment: await this.loadEnvironmentInfo(projectPath)
    }

    console.log('📊 Inspection result - integrations:', inspection.integrations.length)
    if (inspection.integrations.length > 0) {
      console.log('   First integration:', inspection.integrations[0].name)
      console.log('   First integration modules:', Object.keys(inspection.integrations[0].modules || {}))
    }

    return inspection
  }

  async loadProjectConfig(projectPath) {
    const config = {}

    // Load frigg.config.json if exists
    try {
      const configPath = path.join(projectPath, 'frigg.config.json')
      const content = await fs.readFile(configPath, 'utf-8')
      Object.assign(config, JSON.parse(content))
    } catch {
      // Config file might not exist
    }

    // Load package.json
    try {
      const packagePath = path.join(projectPath, 'package.json')
      const content = await fs.readFile(packagePath, 'utf-8')
      const pkg = JSON.parse(content)

      config.package = {
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        scripts: pkg.scripts || {},
        dependencies: this.extractFriggDependencies(pkg.dependencies || {}),
        devDependencies: this.extractFriggDependencies(pkg.devDependencies || {})
      }
    } catch {
      // Package.json should exist but handle gracefully
    }

    // Load rich app definition from backend/index.js
    try {
      const backendIndexPath = path.join(projectPath, 'index.js')
      if (await fs.access(backendIndexPath).then(() => true).catch(() => false)) {
        // Use dynamic require to load the backend definition
        delete require.cache[require.resolve(backendIndexPath)]
        const backendModule = require(backendIndexPath)
        const appDefinition = backendModule.Definition

        if (appDefinition) {
          // Extract the new name/label structure
          config.name = appDefinition.name
          config.label = appDefinition.label

          // Extract the rich configuration data
          config.custom = appDefinition.custom
          config.user = appDefinition.user
          config.encryption = appDefinition.encryption
          config.vpc = appDefinition.vpc
          config.database = appDefinition.database
          config.ssm = appDefinition.ssm
          config.environment = appDefinition.environment
        }
      }
    } catch (error) {
      console.debug('Could not load backend app definition:', error.message)
    }

    return config
  }

  extractFriggDependencies(deps) {
    const friggDeps = {}
    Object.entries(deps).forEach(([name, version]) => {
      if (name.includes('frigg')) {
        friggDeps[name] = version
      }
    })
    return friggDeps
  }

  async loadIntegrationsWithModules(projectPath) {
    const integrations = []
    const integrationsPath = path.join(projectPath, 'src', 'integrations')

    try {
      const files = await fs.readdir(integrationsPath)

      for (const file of files) {
        if (file.endsWith('.js')) {
          const integrationPath = path.join(integrationsPath, file)
          const integration = await this.parseIntegrationWithDetails(integrationPath)

          if (integration) {
            // Load module details for each module used by this integration
            integration.modules = await this.loadIntegrationModules(
              projectPath,
              integration.moduleNames
            )
            integrations.push(integration)
          }
        }
      }
    } catch (error) {
      console.debug(`No integrations directory found: ${error.message}`)
    }

    return integrations
  }

  async parseIntegrationWithDetails(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const fileName = path.basename(filePath, '.js')

      // Extract various parts of the integration definition
      const integration = {
        name: fileName,
        path: filePath,
        className: null,
        definition: {},
        modules: {},
        routes: [],
        events: [],
        display: {},
        moduleNames: []
      }

      // Parse class name
      const classMatch = content.match(/class\s+(\w+)\s+extends/)
      if (classMatch) {
        integration.className = classMatch[1]
      }

      // Parse Definition object
      const definitionMatch = content.match(/static\s+Definition\s*=\s*{([\s\S]*?)^[\s]*}/m)
      if (definitionMatch) {
        const defContent = definitionMatch[1]

        // Extract name
        const nameMatch = defContent.match(/name:\s*['"]([^'"]+)['"]/)
        if (nameMatch) integration.definition.name = nameMatch[1]

        // Extract version
        const versionMatch = defContent.match(/version:\s*['"]([^'"]+)['"]/)
        if (versionMatch) integration.definition.version = versionMatch[1]

        // Extract display config
        const displayMatch = defContent.match(/display:\s*({[\s\S]*?})\s*,/)
        if (displayMatch) {
          try {
            // Simple eval alternative - parse JSON-like structure
            const displayStr = displayMatch[1]
              .replace(/(\w+):/g, '"$1":')
              .replace(/'/g, '"')
              .replace(/,\s*}/g, '}')
            integration.display = JSON.parse(displayStr)
          } catch {
            // Display parsing might fail for complex structures
          }
        }

        // Extract modules
        const modulesMatch = defContent.match(/modules:\s*{([\s\S]*?)}\s*,/)
        if (modulesMatch) {
          const modulesContent = modulesMatch[1]
          const moduleMatches = modulesContent.matchAll(/(\w+):\s*{/g)
          for (const match of moduleMatches) {
            integration.moduleNames.push(match[1])
          }
        }

        // Extract routes
        const routesMatch = defContent.match(/routes:\s*\[([\s\S]*?)\]/)
        if (routesMatch) {
          const routesContent = routesMatch[1]
          const routeMatches = routesContent.matchAll(/{([^}]+)}/g)
          for (const match of routeMatches) {
            const routeStr = match[1]
            const route = {}

            const pathMatch = routeStr.match(/path:\s*['"]([^'"]+)['"]/)
            if (pathMatch) route.path = pathMatch[1]

            const methodMatch = routeStr.match(/method:\s*['"]([^'"]+)['"]/)
            if (methodMatch) route.method = methodMatch[1]

            const eventMatch = routeStr.match(/event:\s*['"]([^'"]+)['"]/)
            if (eventMatch) route.event = eventMatch[1]

            if (route.path) integration.routes.push(route)
          }
        }
      }

      // Extract event handlers
      const eventMatches = content.matchAll(/async\s+(\w+)\s*\([^)]*\)\s*{/g)
      for (const match of eventMatches) {
        const methodName = match[1]
        if (!['constructor', 'initialize'].includes(methodName)) {
          integration.events.push(methodName)
        }
      }

      return integration
    } catch (error) {
      console.error(`Failed to parse integration ${filePath}:`, error.message)
      return null
    }
  }

  async loadIntegrationModules(projectPath, moduleNames) {
    const modules = {}

    for (const moduleName of moduleNames) {
      // Try to load from local modules first
      const localModule = await this.loadLocalModule(projectPath, moduleName)
      if (localModule) {
        modules[moduleName] = localModule
        continue
      }

      // Check if it's an installed npm module
      const npmModule = await this.loadNpmModule(projectPath, moduleName)
      if (npmModule) {
        modules[moduleName] = npmModule
      }
    }

    return modules
  }

  async loadLocalModule(projectPath, moduleName) {
    const modulePath = path.join(projectPath, 'src', 'api-modules', moduleName)

    try {
      const indexPath = path.join(modulePath, 'index.js')
      await fs.access(indexPath)

      const content = await fs.readFile(indexPath, 'utf-8')

      return {
        name: moduleName,
        source: 'local',
        path: modulePath,
        definition: await this.parseModuleDefinition(content)
      }
    } catch {
      return null
    }
  }

  async loadNpmModule(projectPath, moduleName) {
    try {
      const packagePath = path.join(projectPath, 'package.json')
      const content = await fs.readFile(packagePath, 'utf-8')
      const pkg = JSON.parse(content)

      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      const packageName = `@friggframework/api-module-${moduleName.toLowerCase()}`

      if (deps[packageName]) {
        return {
          name: moduleName,
          source: 'npm',
          packageName,
          version: deps[packageName],
          isInstalled: true
        }
      }
    } catch {
      // Module not found
    }

    return null
  }

  async parseModuleDefinition(content) {
    const definition = {
      modelName: null,
      moduleName: null,
      requiredAuthMethods: {},
      env: {},
      scopes: []
    }

    // Parse Definition static property
    const defMatch = content.match(/static\s+Definition\s*=\s*{([\s\S]*?)^[\s]*}/m)
    if (defMatch) {
      const defContent = defMatch[1]

      // Extract modelName
      const modelMatch = defContent.match(/modelName:\s*['"]([^'"]+)['"]/)
      if (modelMatch) definition.modelName = modelMatch[1]

      // Extract moduleName
      const moduleMatch = defContent.match(/moduleName:\s*['"]([^'"]+)['"]/)
      if (moduleMatch) definition.moduleName = moduleMatch[1]

      // Extract env variables
      const envMatch = defContent.match(/env:\s*{([\s\S]*?)}/)
      if (envMatch) {
        const envContent = envMatch[1]
        const envVarMatches = envContent.matchAll(/(\w+):\s*process\.env\.([A-Z_]+)/g)
        for (const match of envVarMatches) {
          definition.env[match[1]] = match[2]
        }
      }

      // Extract auth methods
      const authMatch = defContent.match(/requiredAuthMethods:\s*{([\s\S]*?)}/)
      if (authMatch) {
        const authContent = authMatch[1]
        const methodMatches = authContent.matchAll(/(\w+):\s*['"]\w+['"]/g)
        for (const match of methodMatches) {
          definition.requiredAuthMethods[match[1]] = true
        }
      }
    }

    return definition
  }

  async loadAllModules(projectPath) {
    const modules = []

    // Load local modules
    const localModulesPath = path.join(projectPath, 'src', 'api-modules')
    try {
      const entries = await fs.readdir(localModulesPath, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const module = await this.loadLocalModule(projectPath, entry.name)
          if (module) {
            modules.push(module)
          }
        }
      }
    } catch {
      // Local modules directory might not exist
    }

    // Load npm modules from package.json
    try {
      const packagePath = path.join(projectPath, 'package.json')
      const content = await fs.readFile(packagePath, 'utf-8')
      const pkg = JSON.parse(content)

      const deps = { ...pkg.dependencies, ...pkg.devDependencies }

      Object.entries(deps).forEach(([name, version]) => {
        if (name.includes('@friggframework/api-module-')) {
          const moduleName = name.replace('@friggframework/api-module-', '')

          // Don't add if already loaded as local
          if (!modules.find(m => m.name === moduleName)) {
            modules.push({
              name: moduleName,
              source: 'npm',
              packageName: name,
              version,
              isInstalled: true
            })
          }
        }
      })
    } catch {
      // Package.json should exist
    }

    return modules
  }

  async loadGitStatus(projectPath) {
    try {
      const repo = await this.gitAdapter.getRepository()

      return {
        initialized: true,
        currentBranch: repo.currentBranch,
        branches: repo.branches.map(b => ({
          name: b.name,
          current: b.current,
          upstream: b.upstream,
          ahead: b.ahead,
          behind: b.behind
        })),
        remotes: repo.remotes,
        status: repo.status,
        hasChanges: Object.values(repo.status).some(arr =>
          Array.isArray(arr) && arr.length > 0
        )
      }
    } catch (error) {
      return {
        initialized: false,
        error: error.message
      }
    }
  }

  async analyzeProjectStructure(projectPath) {
    const structure = {
      directories: {},
      files: {}
    }

    // Check for important directories
    const dirs = [
      'src/integrations',
      'src/api-modules',
      'src/entities',
      'src/events',
      'src/routes',
      'src/middleware',
      'src/utils',
      'test',
      'config'
    ]

    for (const dir of dirs) {
      const fullPath = path.join(projectPath, dir)
      try {
        const stats = await fs.stat(fullPath)
        structure.directories[dir] = {
          exists: true,
          path: fullPath,
          isDirectory: stats.isDirectory()
        }
      } catch {
        structure.directories[dir] = { exists: false }
      }
    }

    // Check for important files
    const files = [
      'src/app.js',
      'frigg.config.json',
      '.env',
      '.env.example',
      'package.json',
      'README.md',
      'Dockerfile',
      'docker-compose.yml'
    ]

    for (const file of files) {
      const fullPath = path.join(projectPath, file)
      try {
        const stats = await fs.stat(fullPath)
        structure.files[file] = {
          exists: true,
          path: fullPath,
          size: stats.size
        }
      } catch {
        structure.files[file] = { exists: false }
      }
    }

    return structure
  }

  async loadEnvironmentInfo(projectPath) {
    const envInfo = {
      variables: [],
      required: [],
      configured: []
    }

    // Load .env.example for required vars
    try {
      const examplePath = path.join(projectPath, '.env.example')
      const content = await fs.readFile(examplePath, 'utf-8')
      const lines = content.split('\n')

      for (const line of lines) {
        if (line && !line.startsWith('#')) {
          const [key] = line.split('=')
          if (key) {
            envInfo.required.push(key.trim())
          }
        }
      }
    } catch {
      // .env.example might not exist
    }

    // Load .env for configured vars (without values for security)
    try {
      const envPath = path.join(projectPath, '.env')
      const content = await fs.readFile(envPath, 'utf-8')
      const lines = content.split('\n')

      for (const line of lines) {
        if (line && !line.startsWith('#')) {
          const [key] = line.split('=')
          if (key) {
            envInfo.configured.push(key.trim())
          }
        }
      }
    } catch {
      // .env might not exist
    }

    // Determine which required vars are missing
    envInfo.missing = envInfo.required.filter(v => !envInfo.configured.includes(v))

    return envInfo
  }
}