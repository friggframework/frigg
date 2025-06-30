import express from 'express'
import { getMonitoringService } from '../services/aws-monitor.js'
import { wsHandler } from '../websocket/handler.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = express.Router()

// Initialize monitoring service
let monitoringService = null

/**
 * Initialize monitoring with configuration
 */
router.post('/init', asyncHandler(async (req, res) => {
    const { region, stage, serviceName, collectionInterval } = req.body
    
    // Create or reconfigure monitoring service
    monitoringService = getMonitoringService({
        region: region || process.env.AWS_REGION,
        stage: stage || process.env.STAGE,
        serviceName: serviceName || process.env.SERVICE_NAME,
        collectionInterval: collectionInterval || 60000
    })
    
    // Set up event listeners for real-time updates
    monitoringService.removeAllListeners() // Clear any existing listeners
    
    monitoringService.on('metrics', (metrics) => {
        // Broadcast metrics to all subscribed WebSocket clients
        wsHandler.broadcast('monitoring:metrics', metrics)
    })
    
    monitoringService.on('error', (error) => {
        // Broadcast errors to WebSocket clients
        wsHandler.broadcast('monitoring:error', error)
    })
    
    res.json({
        success: true,
        message: 'Monitoring service initialized',
        config: {
            region: monitoringService.region,
            stage: monitoringService.stage,
            serviceName: monitoringService.serviceName,
            collectionInterval: monitoringService.collectionInterval
        }
    })
}))

/**
 * Start monitoring
 */
router.post('/start', asyncHandler(async (req, res) => {
    if (!monitoringService) {
        return res.status(400).json({
            success: false,
            error: 'Monitoring service not initialized. Call /init first.'
        })
    }
    
    await monitoringService.startMonitoring()
    
    res.json({
        success: true,
        message: 'Monitoring started',
        isMonitoring: monitoringService.isMonitoring
    })
}))

/**
 * Stop monitoring
 */
router.post('/stop', asyncHandler(async (req, res) => {
    if (!monitoringService) {
        return res.status(400).json({
            success: false,
            error: 'Monitoring service not initialized'
        })
    }
    
    monitoringService.stopMonitoring()
    
    res.json({
        success: true,
        message: 'Monitoring stopped',
        isMonitoring: monitoringService.isMonitoring
    })
}))

/**
 * Get monitoring status
 */
router.get('/status', asyncHandler(async (req, res) => {
    if (!monitoringService) {
        return res.json({
            initialized: false,
            isMonitoring: false
        })
    }
    
    res.json({
        initialized: true,
        isMonitoring: monitoringService.isMonitoring,
        config: {
            region: monitoringService.region,
            stage: monitoringService.stage,
            serviceName: monitoringService.serviceName,
            collectionInterval: monitoringService.collectionInterval
        }
    })
}))

/**
 * Get latest metrics
 */
router.get('/metrics/latest', asyncHandler(async (req, res) => {
    if (!monitoringService) {
        return res.status(400).json({
            success: false,
            error: 'Monitoring service not initialized'
        })
    }
    
    const metrics = monitoringService.getLatestMetrics()
    
    if (!metrics) {
        return res.json({
            success: true,
            message: 'No metrics available yet',
            data: null
        })
    }
    
    res.json({
        success: true,
        data: metrics
    })
}))

/**
 * Force collect metrics now
 */
router.post('/metrics/collect', asyncHandler(async (req, res) => {
    if (!monitoringService) {
        return res.status(400).json({
            success: false,
            error: 'Monitoring service not initialized'
        })
    }
    
    const metrics = await monitoringService.collectAllMetrics()
    
    res.json({
        success: true,
        message: 'Metrics collected',
        data: metrics
    })
}))

/**
 * Get historical metrics
 */
router.get('/metrics/history', asyncHandler(async (req, res) => {
    if (!monitoringService) {
        return res.status(400).json({
            success: false,
            error: 'Monitoring service not initialized'
        })
    }
    
    const { limit = 10 } = req.query
    const history = monitoringService.getHistoricalMetrics(parseInt(limit))
    
    res.json({
        success: true,
        data: history
    })
}))

/**
 * Publish custom metric
 */
router.post('/metrics/custom', asyncHandler(async (req, res) => {
    if (!monitoringService) {
        return res.status(400).json({
            success: false,
            error: 'Monitoring service not initialized'
        })
    }
    
    const { metricName, value, unit, dimensions } = req.body
    
    if (!metricName || value === undefined) {
        return res.status(400).json({
            success: false,
            error: 'metricName and value are required'
        })
    }
    
    await monitoringService.publishCustomMetric(
        metricName,
        value,
        unit,
        dimensions
    )
    
    res.json({
        success: true,
        message: 'Custom metric published',
        metric: {
            name: metricName,
            value,
            unit: unit || 'Count'
        }
    })
}))

/**
 * Get Lambda function details
 */
router.get('/lambda/:functionName', asyncHandler(async (req, res) => {
    if (!monitoringService) {
        return res.status(400).json({
            success: false,
            error: 'Monitoring service not initialized'
        })
    }
    
    const { functionName } = req.params
    const metrics = await monitoringService.getLambdaMetrics(functionName)
    
    res.json({
        success: true,
        data: {
            functionName,
            metrics
        }
    })
}))

/**
 * Get API Gateway details
 */
router.get('/apigateway/:apiName', asyncHandler(async (req, res) => {
    if (!monitoringService) {
        return res.status(400).json({
            success: false,
            error: 'Monitoring service not initialized'
        })
    }
    
    const { apiName } = req.params
    const metrics = await monitoringService.getAPIGatewayMetrics(apiName)
    
    res.json({
        success: true,
        data: {
            apiName,
            metrics
        }
    })
}))

/**
 * Subscribe to real-time metrics via WebSocket
 * This is just documentation - actual subscription happens via WebSocket
 */
router.get('/subscribe', (req, res) => {
    res.json({
        success: true,
        message: 'To subscribe to real-time metrics, connect via WebSocket and subscribe to the "monitoring:metrics" topic',
        websocketUrl: `ws://localhost:${process.env.PORT || 3002}`,
        example: {
            type: 'subscribe',
            data: {
                topics: ['monitoring:metrics', 'monitoring:error']
            }
        }
    })
})

export default router