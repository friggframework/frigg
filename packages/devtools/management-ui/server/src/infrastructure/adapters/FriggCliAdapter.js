import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs/promises'

const execAsync = promisify(exec)

/**
 * Adapter for interacting with Frigg CLI
 * Wraps CLI commands for use by the application layer
 */
export class FriggCliAdapter {
  constructor({ projectPath, cliPath = 'frigg' }) {
    this.projectPath = projectPath
    this.cliPath = cliPath
  }

  async installModule(packageName, version) {
    try {
      const versionArg = version ? `@${version}` : ''
      const { stdout } = await execAsync(
        `${this.cliPath} module install ${packageName}${versionArg}`,
        { cwd: this.projectPath }
      )

      // Parse the output to get installation details
      const lines = stdout.split('\n')
      const versionLine = lines.find(l => l.includes('version'))
      const installedVersion = versionLine?.match(/version[:\s]+([^\s]+)/)?.[1] || version

      return {
        success: true,
        version: installedVersion,
        output: stdout
      }
    } catch (error) {
      throw new Error(`Failed to install module ${packageName}: ${error.message}`)
    }
  }

  async loadModuleDefinition(packageName) {
    try {
      // Try to require the module and get its Definition
      const modulePath = path.join(this.projectPath, 'node_modules', packageName)
      const moduleExports = await import(modulePath)
      return moduleExports.Definition || moduleExports.default?.Definition
    } catch (error) {
      console.error(`Failed to load module definition for ${packageName}:`, error)
      return null
    }
  }

  async getModuleConfig(packageName) {
    try {
      // Look for defaultConfig.json in the module
      const configPath = path.join(
        this.projectPath,
        'node_modules',
        packageName,
        'defaultConfig.json'
      )
      const configContent = await fs.readFile(configPath, 'utf-8')
      return JSON.parse(configContent)
    } catch (error) {
      // Config file is optional
      return {}
    }
  }

  async generateIntegration({ name, className, display, modules }) {
    try {
      const args = [
        'integration',
        'create',
        name,
        '--className', className
      ]

      if (display.label) args.push('--label', display.label)
      if (display.description) args.push('--description', display.description)
      if (display.category) args.push('--category', display.category)
      if (modules.length > 0) args.push('--modules', modules.join(','))

      const { stdout } = await execAsync(
        `${this.cliPath} ${args.join(' ')}`,
        { cwd: this.projectPath }
      )

      // Parse output to get the generated file path
      const pathMatch = stdout.match(/Created integration at: (.+)/) ||
                        stdout.match(/Generated: (.+)/)
      const generatedPath = pathMatch?.[1] ||
                           path.join(this.projectPath, 'src', 'integrations', `${className}.js`)

      return generatedPath
    } catch (error) {
      throw new Error(`Failed to generate integration ${name}: ${error.message}`)
    }
  }

  async updateIntegrationFile({ path: filePath, className, definition, events }) {
    // Read the current file
    const currentContent = await fs.readFile(filePath, 'utf-8')

    // Generate new content (simplified - in reality would use AST manipulation)
    const newContent = this.generateIntegrationCode(className, definition, events)

    // Write back
    await fs.writeFile(filePath, newContent, 'utf-8')

    return { success: true }
  }

  generateIntegrationCode(className, definition, events) {
    const moduleRequires = Object.keys(definition.modules || {})
      .map(name => `const ${name} = require('../api-modules/${name}');`)
      .join('\n')

    return `const { IntegrationBase } = require('@friggframework/core');
${moduleRequires}

class ${className} extends IntegrationBase {
    static Definition = ${JSON.stringify(definition, null, 4)};

    constructor() {
        super();
        this.events = {
${events.map(event => `            ${event}: {
                handler: this.${this.eventToMethodName(event)}.bind(this),
            }`).join(',\n')}
        };
    }

${events.map(event => `    async ${this.eventToMethodName(event)}({ req, res }) {
        // TODO: Implement ${event} handler
    }`).join('\n\n')}
}

module.exports = ${className};
`
  }

  eventToMethodName(eventName) {
    return eventName.toLowerCase()
      .split('_')
      .map((word, index) =>
        index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join('')
  }

  async deleteIntegrationFile(filePath) {
    try {
      await fs.unlink(filePath)
      return { success: true }
    } catch (error) {
      throw new Error(`Failed to delete integration file: ${error.message}`)
    }
  }

  async initializeProject({ name, path: projectPath }) {
    try {
      const { stdout } = await execAsync(
        `${this.cliPath} init ${name}`,
        { cwd: projectPath }
      )

      return {
        success: true,
        output: stdout
      }
    } catch (error) {
      throw new Error(`Failed to initialize project: ${error.message}`)
    }
  }
}