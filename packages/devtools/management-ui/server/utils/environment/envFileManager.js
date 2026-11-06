import fs from 'fs/promises';
import path from 'path';
import { parse, stringify } from 'dotenv';

class EnvFileManager {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.environments = {
      local: '.env.local',
      staging: '.env.staging',
      production: '.env.production'
    };
  }

  /**
   * Read environment variables from a specific environment file
   */
  async readEnvFile(environment = 'local') {
    const fileName = this.environments[environment] || '.env';
    const filePath = path.join(this.projectRoot, fileName);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = parse(content);
      
      // Convert to our variable format
      const variables = Object.entries(parsed).map(([key, value]) => ({
        id: `${environment}-${key}`,
        key,
        value,
        description: this.extractDescription(content, key),
        isSecret: this.isSecretVariable(key),
        environment
      }));
      
      return variables;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return empty array
        return [];
      }
      throw error;
    }
  }

  /**
   * Write environment variables to a specific environment file
   */
  async writeEnvFile(environment, variables) {
    const fileName = this.environments[environment] || '.env';
    const filePath = path.join(this.projectRoot, fileName);
    
    // Create backup first
    await this.createBackup(filePath);
    
    // Build the content
    let content = '';
    const sortedVars = [...variables].sort((a, b) => a.key.localeCompare(b.key));
    
    for (const variable of sortedVars) {
      // Add description as comment if exists
      if (variable.description) {
        content += `# ${variable.description}\n`;
      }
      
      // Add the variable
      const value = this.escapeValue(variable.value);
      content += `${variable.key}=${value}\n`;
      
      // Add extra newline between variables for readability
      content += '\n';
    }
    
    // Write the file
    await fs.writeFile(filePath, content.trim());
    
    return { success: true, path: filePath };
  }

  /**
   * Create a backup of the env file before modifying
   */
  async createBackup(filePath) {
    try {
      const backupPath = `${filePath}.backup.${Date.now()}`;
      await fs.copyFile(filePath, backupPath);
      
      // Keep only last 5 backups
      await this.cleanupOldBackups(filePath);
    } catch (error) {
      // Ignore if file doesn't exist
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Clean up old backup files
   */
  async cleanupOldBackups(filePath) {
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath);
    const backupPattern = new RegExp(`^${basename}\\.backup\\.\\d+$`);
    
    const files = await fs.readdir(dir);
    const backups = files
      .filter(f => backupPattern.test(f))
      .map(f => ({
        name: f,
        path: path.join(dir, f)
      }));
    
    // Sort by timestamp (newest first)
    backups.sort((a, b) => {
      const timeA = parseInt(a.name.split('.').pop());
      const timeB = parseInt(b.name.split('.').pop());
      return timeB - timeA;
    });
    
    // Delete old backups
    for (let i = 5; i < backups.length; i++) {
      await fs.unlink(backups[i].path);
    }
  }

  /**
   * Extract description comment for a variable from the file content
   */
  extractDescription(content, key) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith(`${key}=`)) {
        // Check previous line for comment
        if (i > 0 && lines[i - 1].trim().startsWith('#')) {
          return lines[i - 1].trim().substring(1).trim();
        }
        break;
      }
    }
    return '';
  }

  /**
   * Determine if a variable should be treated as secret based on its name
   */
  isSecretVariable(key) {
    const secretPatterns = [
      /password/i,
      /secret/i,
      /key/i,
      /token/i,
      /credential/i,
      /auth/i,
      /private/i,
      /api_key/i
    ];
    
    return secretPatterns.some(pattern => pattern.test(key));
  }

  /**
   * Escape value for .env file format
   */
  escapeValue(value) {
    // If value contains spaces, newlines, or quotes, wrap in quotes
    if (/[\s"'`]/.test(value) || value === '') {
      // Escape any double quotes in the value
      const escaped = value.replace(/"/g, '\\"');
      return `"${escaped}"`;
    }
    return value;
  }

  /**
   * Validate environment variables
   */
  validateVariables(variables) {
    const errors = [];
    const seen = new Set();
    
    for (const variable of variables) {
      // Check for duplicates
      if (seen.has(variable.key)) {
        errors.push({
          id: variable.id,
          error: `Duplicate key: ${variable.key}`
        });
      }
      seen.add(variable.key);
      
      // Validate key format
      if (!/^[A-Z_][A-Z0-9_]*$/i.test(variable.key)) {
        errors.push({
          id: variable.id,
          error: `Invalid key format: ${variable.key}`
        });
      }
      
      // Type-specific validation
      if (variable.key.endsWith('_PORT') && variable.value) {
        const port = parseInt(variable.value);
        if (isNaN(port) || port < 1 || port > 65535) {
          errors.push({
            id: variable.id,
            error: `Invalid port value: ${variable.value}`
          });
        }
      }
      
      if (variable.key.endsWith('_URL') && variable.value) {
        try {
          new URL(variable.value);
        } catch {
          errors.push({
            id: variable.id,
            error: `Invalid URL format: ${variable.value}`
          });
        }
      }
    }
    
    return errors;
  }

  /**
   * Merge variables from multiple sources (e.g., file and AWS)
   */
  mergeVariables(fileVars, externalVars, preferExternal = false) {
    const merged = new Map();
    
    // Add file variables first
    for (const v of fileVars) {
      merged.set(v.key, v);
    }
    
    // Merge or override with external variables
    for (const v of externalVars) {
      if (preferExternal || !merged.has(v.key)) {
        merged.set(v.key, v);
      }
    }
    
    return Array.from(merged.values());
  }

  /**
   * Get all environments and their variables
   */
  async getAllEnvironments() {
    const result = {};
    
    for (const [env, _] of Object.entries(this.environments)) {
      try {
        result[env] = await this.readEnvFile(env);
      } catch (error) {
        console.error(`Error reading ${env} environment:`, error);
        result[env] = [];
      }
    }
    
    return result;
  }

  /**
   * Copy variables from one environment to another
   */
  async copyEnvironment(source, target, excludeSecrets = true) {
    const sourceVars = await this.readEnvFile(source);
    
    const targetVars = sourceVars
      .filter(v => !excludeSecrets || !v.isSecret)
      .map(v => ({
        ...v,
        environment: target,
        id: `${target}-${v.key}`
      }));
    
    await this.writeEnvFile(target, targetVars);
    
    return targetVars;
  }
}

export default EnvFileManager;