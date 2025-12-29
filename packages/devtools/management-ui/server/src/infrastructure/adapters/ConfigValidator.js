import fs from 'fs/promises'
import path from 'path'

/**
 * Validates project configuration for running Frigg
 */
export class ConfigValidator {
  async validate(project) {
    const errors = []
    const warnings = []

    // Check package.json exists
    const packageJsonPath = path.join(project.path, 'package.json')
    if (!await this.fileExists(packageJsonPath)) {
      errors.push('package.json not found')
    } else {
      // Validate package.json has required scripts
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
      if (!packageJson.scripts?.dev && !packageJson.scripts?.start) {
        errors.push('No dev or start script found in package.json')
      }
    }

    // Check for app definition
    const appPath = path.join(project.path, 'src', 'app.js')
    if (!await this.fileExists(appPath)) {
      warnings.push('app.js not found - project may not be properly initialized')
    }

    // Check for required environment variables
    const requiredEnvVars = project.getRequiredEnvVars()
    const missingEnvVars = []

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        missingEnvVars.push(envVar)
      }
    }

    if (missingEnvVars.length > 0) {
      warnings.push(`Missing environment variables: ${missingEnvVars.join(', ')}`)
    }

    // Check node_modules exists
    const nodeModulesPath = path.join(project.path, 'node_modules')
    if (!await this.fileExists(nodeModulesPath)) {
      errors.push('node_modules not found - run npm install')
    }

    // Check for .env file
    const envPath = path.join(project.path, '.env')
    if (!await this.fileExists(envPath)) {
      warnings.push('.env file not found - environment variables may not be configured')
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
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