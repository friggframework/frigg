import express from 'express'
import { createStandardResponse, createErrorResponse, ERROR_CODES, asyncHandler } from '../utils/response.js'

const router = express.Router()

// In-memory log storage (in production, this would be a persistent store)
let applicationLogs = []
const MAX_LOG_ENTRIES = 10000

// Log levels
const LOG_LEVELS = {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug'
}

/**
 * Add a log entry
 */
function addLogEntry(level, message, component = 'system', metadata = {}) {
    const logEntry = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        level,
        message,
        component,
        metadata,
        timestamp: new Date().toISOString()
    }
    
    applicationLogs.push(logEntry)
    
    // Keep only the most recent entries
    if (applicationLogs.length > MAX_LOG_ENTRIES) {
        applicationLogs = applicationLogs.slice(-MAX_LOG_ENTRIES)
    }
    
    return logEntry
}

/**
 * Get application logs
 */
router.get('/', asyncHandler(async (req, res) => {
    const {
        limit = 100,
        level,
        component,
        since,
        search
    } = req.query

    let filteredLogs = [...applicationLogs]

    // Filter by level
    if (level && Object.values(LOG_LEVELS).includes(level)) {
        filteredLogs = filteredLogs.filter(log => log.level === level)
    }

    // Filter by component
    if (component) {
        filteredLogs = filteredLogs.filter(log => 
            log.component.toLowerCase().includes(component.toLowerCase())
        )
    }

    // Filter by timestamp
    if (since) {
        const sinceDate = new Date(since)
        if (!isNaN(sinceDate.getTime())) {
            filteredLogs = filteredLogs.filter(log => 
                new Date(log.timestamp) >= sinceDate
            )
        }
    }

    // Search in message content
    if (search) {
        const searchTerm = search.toLowerCase()
        filteredLogs = filteredLogs.filter(log =>
            log.message.toLowerCase().includes(searchTerm) ||
            log.component.toLowerCase().includes(searchTerm) ||
            JSON.stringify(log.metadata).toLowerCase().includes(searchTerm)
        )
    }

    // Sort by timestamp (newest first)
    filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

    // Limit results
    const limitInt = parseInt(limit)
    if (limitInt > 0) {
        filteredLogs = filteredLogs.slice(0, limitInt)
    }

    res.json(createStandardResponse({
        logs: filteredLogs,
        total: applicationLogs.length,
        filtered: filteredLogs.length,
        filters: {
            level,
            component,
            since,
            search,
            limit: limitInt
        }
    }))
}))

/**
 * Add a new log entry
 */
router.post('/', asyncHandler(async (req, res) => {
    const { level, message, component = 'api', metadata = {} } = req.body

    if (!level || !message) {
        return res.status(400).json(
            createErrorResponse(ERROR_CODES.INVALID_REQUEST, 'Level and message are required')
        )
    }

    if (!Object.values(LOG_LEVELS).includes(level)) {
        return res.status(400).json(
            createErrorResponse(ERROR_CODES.INVALID_REQUEST, `Invalid log level. Must be one of: ${Object.values(LOG_LEVELS).join(', ')}`)
        )
    }

    const logEntry = addLogEntry(level, message, component, metadata)
    
    // Broadcast new log entry via WebSocket
    const io = req.app.get('io')
    if (io) {
        io.emit('logs:new', logEntry)
    }

    res.status(201).json(createStandardResponse(logEntry, 'Log entry created'))
}))

/**
 * Clear all logs
 */
router.delete('/', asyncHandler(async (req, res) => {
    const previousCount = applicationLogs.length
    applicationLogs = []
    
    // Broadcast logs cleared event via WebSocket
    const io = req.app.get('io')
    if (io) {
        io.emit('logs:cleared', {
            clearedCount: previousCount,
            timestamp: new Date().toISOString()
        })
    }

    res.json(createStandardResponse({
        message: 'All logs cleared',
        clearedCount: previousCount
    }))
}))

/**
 * Get log statistics
 */
router.get('/stats', asyncHandler(async (req, res) => {
    const stats = {
        total: applicationLogs.length,
        byLevel: {},
        byComponent: {},
        oldest: null,
        newest: null
    }

    // Count by level
    Object.values(LOG_LEVELS).forEach(level => {
        stats.byLevel[level] = applicationLogs.filter(log => log.level === level).length
    })

    // Count by component
    const components = [...new Set(applicationLogs.map(log => log.component))]
    components.forEach(component => {
        stats.byComponent[component] = applicationLogs.filter(log => log.component === component).length
    })

    // Get oldest and newest timestamps
    if (applicationLogs.length > 0) {
        const sortedByTime = [...applicationLogs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        stats.oldest = sortedByTime[0].timestamp
        stats.newest = sortedByTime[sortedByTime.length - 1].timestamp
    }

    res.json(createStandardResponse(stats))
}))

/**
 * Export logs (for backup/analysis)
 */
router.get('/export', asyncHandler(async (req, res) => {
    const { format = 'json', level, component, since } = req.query
    
    let logsToExport = [...applicationLogs]

    // Apply filters
    if (level) {
        logsToExport = logsToExport.filter(log => log.level === level)
    }
    
    if (component) {
        logsToExport = logsToExport.filter(log => log.component === component)
    }
    
    if (since) {
        const sinceDate = new Date(since)
        if (!isNaN(sinceDate.getTime())) {
            logsToExport = logsToExport.filter(log => new Date(log.timestamp) >= sinceDate)
        }
    }

    // Sort by timestamp
    logsToExport.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

    if (format === 'csv') {
        // Export as CSV
        const csvHeader = 'timestamp,level,component,message,metadata\n'
        const csvRows = logsToExport.map(log => {
            const escapedMessage = `"${log.message.replace(/"/g, '""')}"`
            const escapedMetadata = `"${JSON.stringify(log.metadata).replace(/"/g, '""')}"`
            return `${log.timestamp},${log.level},${log.component},${escapedMessage},${escapedMetadata}`
        }).join('\n')
        
        res.setHeader('Content-Type', 'text/csv')
        res.setHeader('Content-Disposition', `attachment; filename=frigg-logs-${new Date().toISOString().split('T')[0]}.csv`)
        res.send(csvHeader + csvRows)
    } else {
        // Export as JSON
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Content-Disposition', `attachment; filename=frigg-logs-${new Date().toISOString().split('T')[0]}.json`)
        res.json({
            exportedAt: new Date().toISOString(),
            totalLogs: logsToExport.length,
            filters: { level, component, since },
            logs: logsToExport
        })
    }
}))

// Export the addLogEntry function for use by other modules
export { addLogEntry, LOG_LEVELS }
export default router