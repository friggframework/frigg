import express from 'express'
import { wsHandler } from '../../websocket/handler.js'

const router = express.Router()

// Store active simulation sessions
const simulationSessions = new Map()

// Simulate user authentication for integration testing
router.post('/authenticate', async (req, res) => {
    const { userId, integrationId } = req.body
    
    if (!userId || !integrationId) {
        return res.status(400).json({
            error: 'userId and integrationId are required'
        })
    }
    
    try {
        // Create a simulated auth token
        const sessionId = `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        const authToken = `sim_token_${userId}_${integrationId}_${Date.now()}`
        
        const session = {
            sessionId,
            userId,
            integrationId,
            authToken,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour
            status: 'active'
        }
        
        simulationSessions.set(sessionId, session)
        
        // Broadcast simulation event
        wsHandler.broadcast('simulation:auth', {
            action: 'authenticated',
            session,
            timestamp: new Date().toISOString()
        })
        
        res.json({
            status: 'success',
            session
        })
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to simulate authentication'
        })
    }
})

// Simulate user actions within an integration
router.post('/action', async (req, res) => {
    const { sessionId, action, payload } = req.body
    
    if (!sessionId || !action) {
        return res.status(400).json({
            error: 'sessionId and action are required'
        })
    }
    
    const session = simulationSessions.get(sessionId)
    if (!session) {
        return res.status(404).json({
            error: 'Session not found'
        })
    }
    
    try {
        const actionResult = {
            actionId: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            sessionId,
            userId: session.userId,
            integrationId: session.integrationId,
            action,
            payload,
            timestamp: new Date().toISOString(),
            result: 'success',
            response: generateMockResponse(action, payload)
        }
        
        // Broadcast action event
        wsHandler.broadcast('simulation:action', {
            action: 'performed',
            actionResult,
            timestamp: new Date().toISOString()
        })
        
        res.json({
            status: 'success',
            actionResult
        })
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to simulate action'
        })
    }
})

// Get active simulation sessions
router.get('/sessions', async (req, res) => {
    try {
        const sessions = Array.from(simulationSessions.values())
            .filter(session => new Date(session.expiresAt) > new Date())
        
        res.json({
            sessions,
            total: sessions.length
        })
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to fetch sessions'
        })
    }
})

// End a simulation session
router.delete('/sessions/:sessionId', async (req, res) => {
    const { sessionId } = req.params
    
    if (!simulationSessions.has(sessionId)) {
        return res.status(404).json({
            error: 'Session not found'
        })
    }
    
    try {
        const session = simulationSessions.get(sessionId)
        simulationSessions.delete(sessionId)
        
        // Broadcast session end
        wsHandler.broadcast('simulation:session', {
            action: 'ended',
            sessionId,
            userId: session.userId,
            timestamp: new Date().toISOString()
        })
        
        res.json({
            status: 'success',
            message: 'Session ended'
        })
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to end session'
        })
    }
})

// Simulate integration webhook events
router.post('/webhook', async (req, res) => {
    const { userId, integrationId, event, data } = req.body
    
    if (!userId || !integrationId || !event) {
        return res.status(400).json({
            error: 'userId, integrationId, and event are required'
        })
    }
    
    try {
        const webhookEvent = {
            eventId: `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId,
            integrationId,
            event,
            data,
            timestamp: new Date().toISOString(),
            processed: false
        }
        
        // Broadcast webhook event
        wsHandler.broadcast('simulation:webhook', {
            action: 'received',
            webhookEvent,
            timestamp: new Date().toISOString()
        })
        
        // Simulate processing delay
        setTimeout(() => {
            webhookEvent.processed = true
            wsHandler.broadcast('simulation:webhook', {
                action: 'processed',
                webhookEvent,
                timestamp: new Date().toISOString()
            })
        }, 1000)
        
        res.json({
            status: 'success',
            webhookEvent
        })
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to simulate webhook'
        })
    }
})

// Helper function to generate mock responses
function generateMockResponse(action, payload) {
    const mockResponses = {
        'list': {
            items: [
                { id: '1', name: 'Item 1', created: new Date().toISOString() },
                { id: '2', name: 'Item 2', created: new Date().toISOString() }
            ],
            total: 2
        },
        'create': {
            id: `item_${Date.now()}`,
            ...payload,
            created: new Date().toISOString()
        },
        'update': {
            id: payload?.id || `item_${Date.now()}`,
            ...payload,
            updated: new Date().toISOString()
        },
        'delete': {
            success: true,
            deleted: new Date().toISOString()
        },
        'sync': {
            synced: Math.floor(Math.random() * 100),
            failed: Math.floor(Math.random() * 10),
            timestamp: new Date().toISOString()
        }
    }
    
    return mockResponses[action] || { 
        success: true, 
        action, 
        timestamp: new Date().toISOString() 
    }
}

// Clean up expired sessions periodically
setInterval(() => {
    const now = new Date()
    for (const [sessionId, session] of simulationSessions.entries()) {
        if (new Date(session.expiresAt) < now) {
            simulationSessions.delete(sessionId)
        }
    }
}, 60000) // Every minute

export default router