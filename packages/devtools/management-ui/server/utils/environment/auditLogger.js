import fs from 'fs/promises'
import path from 'path'
import { EventEmitter } from 'events'

class EnvironmentAuditLogger extends EventEmitter {
  constructor(options = {}) {
    super()
    
    this.logDir = options.logDir || path.join(process.cwd(), 'logs', 'audit')
    this.maxLogSize = options.maxLogSize || 10 * 1024 * 1024 // 10MB
    this.maxLogFiles = options.maxLogFiles || 10
    this.currentLogFile = null
    this.logStream = null
    
    this.initializeLogger()
  }

  /**
   * Initialize the audit logger
   */
  async initializeLogger() {
    try {
      // Ensure log directory exists
      await fs.mkdir(this.logDir, { recursive: true })
      
      // Get current log file
      this.currentLogFile = await this.getCurrentLogFile()
    } catch (error) {
      console.error('Failed to initialize audit logger:', error)
    }
  }

  /**
   * Get current log file path
   */
  async getCurrentLogFile() {
    const date = new Date().toISOString().split('T')[0]
    const baseFileName = `env-audit-${date}.log`
    let fileName = baseFileName
    let counter = 1
    
    // Check if file exists and size
    while (true) {
      const filePath = path.join(this.logDir, fileName)
      
      try {
        const stats = await fs.stat(filePath)
        
        if (stats.size < this.maxLogSize) {
          return filePath
        }
        
        // File is too large, create new one
        fileName = `env-audit-${date}-${counter}.log`
        counter++
      } catch (error) {
        // File doesn't exist, use it
        return filePath
      }
    }
  }

  /**
   * Log an audit entry
   */
  async log(entry) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
      id: this.generateId()
    }
    
    try {
      // Write to file
      const logLine = JSON.stringify(logEntry) + '\n'
      await fs.appendFile(this.currentLogFile, logLine)
      
      // Emit event for real-time monitoring
      this.emit('audit', logEntry)
      
      // Check if rotation needed
      await this.checkRotation()
      
      return logEntry
    } catch (error) {
      console.error('Failed to write audit log:', error)
      throw error
    }
  }

  /**
   * Log environment variable change
   */
  async logVariableChange(action, data) {
    const entry = {
      category: 'environment',
      action,
      user: data.user || 'system',
      environment: data.environment || 'unknown',
      variable: data.variable,
      details: {}
    }
    
    switch (action) {
      case 'create':
        entry.details = {
          key: data.key,
          masked: this.shouldMask(data.key)
        }
        break
        
      case 'update':
        entry.details = {
          key: data.key,
          changed: data.changed || [],
          masked: this.shouldMask(data.key)
        }
        break
        
      case 'delete':
        entry.details = {
          key: data.key
        }
        break
        
      case 'import':
        entry.details = {
          count: data.count,
          format: data.format,
          source: data.source
        }
        break
        
      case 'export':
        entry.details = {
          count: data.count,
          format: data.format,
          excludedSecrets: data.excludedSecrets
        }
        break
        
      case 'sync':
        entry.details = {
          source: data.source,
          target: data.target,
          count: data.count
        }
        break
    }
    
    return this.log(entry)
  }

  /**
   * Log access event
   */
  async logAccess(action, data) {
    const entry = {
      category: 'access',
      action,
      user: data.user || 'anonymous',
      environment: data.environment,
      details: {
        ip: data.ip,
        userAgent: data.userAgent,
        method: data.method,
        path: data.path
      }
    }
    
    if (action === 'denied') {
      entry.details.reason = data.reason
    }
    
    return this.log(entry)
  }

  /**
   * Log security event
   */
  async logSecurity(action, data) {
    const entry = {
      category: 'security',
      action,
      user: data.user || 'system',
      details: data.details || {}
    }
    
    return this.log(entry)
  }

  /**
   * Search audit logs
   */
  async search(criteria = {}) {
    const {
      startDate,
      endDate,
      category,
      action,
      user,
      environment,
      variable,
      limit = 100
    } = criteria
    
    const results = []
    const files = await this.getLogFiles()
    
    // Read files in reverse order (newest first)
    for (const file of files.reverse()) {
      const content = await fs.readFile(path.join(this.logDir, file), 'utf-8')
      const lines = content.trim().split('\n')
      
      for (const line of lines.reverse()) {
        if (!line) continue
        
        try {
          const entry = JSON.parse(line)
          
          // Apply filters
          if (startDate && new Date(entry.timestamp) < new Date(startDate)) continue
          if (endDate && new Date(entry.timestamp) > new Date(endDate)) continue
          if (category && entry.category !== category) continue
          if (action && entry.action !== action) continue
          if (user && entry.user !== user) continue
          if (environment && entry.environment !== environment) continue
          if (variable && entry.variable !== variable) continue
          
          results.push(entry)
          
          if (results.length >= limit) {
            return results
          }
        } catch (error) {
          // Skip invalid lines
          continue
        }
      }
    }
    
    return results
  }

  /**
   * Get audit statistics
   */
  async getStatistics(timeRange = '24h') {
    const stats = {
      totalEvents: 0,
      byCategory: {},
      byAction: {},
      byUser: {},
      byEnvironment: {},
      timeline: []
    }
    
    const startTime = this.getStartTime(timeRange)
    const entries = await this.search({ startDate: startTime })
    
    entries.forEach(entry => {
      stats.totalEvents++
      
      // By category
      stats.byCategory[entry.category] = (stats.byCategory[entry.category] || 0) + 1
      
      // By action
      stats.byAction[entry.action] = (stats.byAction[entry.action] || 0) + 1
      
      // By user
      stats.byUser[entry.user] = (stats.byUser[entry.user] || 0) + 1
      
      // By environment
      if (entry.environment) {
        stats.byEnvironment[entry.environment] = 
          (stats.byEnvironment[entry.environment] || 0) + 1
      }
    })
    
    return stats
  }

  /**
   * Export audit logs
   */
  async export(format = 'json', criteria = {}) {
    const entries = await this.search(criteria)
    
    switch (format) {
      case 'csv':
        return this.exportToCsv(entries)
        
      case 'json':
      default:
        return JSON.stringify(entries, null, 2)
    }
  }

  /**
   * Export to CSV format
   */
  exportToCsv(entries) {
    const headers = [
      'Timestamp',
      'Category',
      'Action',
      'User',
      'Environment',
      'Variable',
      'Details'
    ]
    
    const rows = entries.map(entry => [
      entry.timestamp,
      entry.category,
      entry.action,
      entry.user,
      entry.environment || '',
      entry.variable || '',
      JSON.stringify(entry.details || {})
    ])
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    return csv
  }

  /**
   * Clean up old log files
   */
  async cleanup() {
    const files = await this.getLogFiles()
    
    if (files.length > this.maxLogFiles) {
      // Sort files by date (oldest first)
      files.sort()
      
      // Remove old files
      const filesToRemove = files.slice(0, files.length - this.maxLogFiles)
      
      for (const file of filesToRemove) {
        await fs.unlink(path.join(this.logDir, file))
      }
    }
  }

  /**
   * Check if log rotation is needed
   */
  async checkRotation() {
    try {
      const stats = await fs.stat(this.currentLogFile)
      
      if (stats.size >= this.maxLogSize) {
        this.currentLogFile = await this.getCurrentLogFile()
        await this.cleanup()
      }
    } catch (error) {
      // File doesn't exist, no rotation needed
    }
  }

  /**
   * Get list of log files
   */
  async getLogFiles() {
    const files = await fs.readdir(this.logDir)
    return files.filter(file => file.startsWith('env-audit-') && file.endsWith('.log'))
  }

  /**
   * Check if variable should be masked in logs
   */
  shouldMask(key) {
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /key/i,
      /token/i,
      /credential/i,
      /private/i,
      /auth/i
    ]
    
    return sensitivePatterns.some(pattern => pattern.test(key))
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get start time based on time range
   */
  getStartTime(timeRange) {
    const now = new Date()
    
    switch (timeRange) {
      case '1h':
        return new Date(now - 60 * 60 * 1000)
      case '24h':
        return new Date(now - 24 * 60 * 60 * 1000)
      case '7d':
        return new Date(now - 7 * 24 * 60 * 60 * 1000)
      case '30d':
        return new Date(now - 30 * 24 * 60 * 60 * 1000)
      default:
        return new Date(now - 24 * 60 * 60 * 1000)
    }
  }
}

// Singleton instance
let auditLogger = null

/**
 * Get audit logger instance
 */
export function getAuditLogger(options) {
  if (!auditLogger) {
    auditLogger = new EnvironmentAuditLogger(options)
  }
  return auditLogger
}

/**
 * Audit middleware
 */
export function auditMiddleware(req, res, next) {
  const logger = getAuditLogger()
  
  // Log access
  logger.logAccess('access', {
    user: req.user?.email || 'anonymous',
    environment: req.params.environment || req.query.environment,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    method: req.method,
    path: req.path
  })
  
  // Intercept responses for logging changes
  const originalJson = res.json
  res.json = function(data) {
    // Log successful changes
    if (res.statusCode < 400 && ['POST', 'PUT', 'DELETE'].includes(req.method)) {
      const action = req.method === 'POST' ? 'create' : 
                    req.method === 'PUT' ? 'update' : 
                    'delete'
      
      logger.logVariableChange(action, {
        user: req.user?.email || 'anonymous',
        environment: req.params.environment || req.body.environment,
        key: req.params.key || req.body.key,
        ...req.body
      })
    }
    
    return originalJson.call(this, data)
  }
  
  next()
}

export default EnvironmentAuditLogger