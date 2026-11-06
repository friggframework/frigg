import express from 'express'
import crypto from 'crypto'
import { wsHandler } from '../../websocket/handler.js'

const router = express.Router()

// In-memory session store (for development only)
const sessions = new Map()
const sessionsByUser = new Map()

// Session configuration
const SESSION_DURATION = 3600000 // 1 hour
const MAX_SESSIONS_PER_USER = 5

// Create a new session
router.post('/create', async (req, res) => {
    const { userId, metadata = {} } = req.body
    
    if (!userId) {
        return res.status(400).json({
            error: 'userId is required'
        })
    }
    
    try {
        // Clean up expired sessions for this user
        cleanupUserSessions(userId)
        
        // Check session limit
        const userSessions = sessionsByUser.get(userId) || []
        if (userSessions.length >= MAX_SESSIONS_PER_USER) {
            // Remove oldest session
            const oldestSession = userSessions[0]
            removeSession(oldestSession)
        }
        
        // Create new session
        const sessionId = `sess_${crypto.randomBytes(16).toString('hex')}`
        const sessionToken = `token_${crypto.randomBytes(32).toString('hex')}`
        
        const session = {
            id: sessionId,
            userId,
            token: sessionToken,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + SESSION_DURATION).toISOString(),
            lastActivity: new Date().toISOString(),
            metadata,
            active: true,
            activities: []
        }
        
        // Store session
        sessions.set(sessionId, session)
        
        // Update user sessions
        const updatedUserSessions = [...(sessionsByUser.get(userId) || []), sessionId]
        sessionsByUser.set(userId, updatedUserSessions)
        
        // Broadcast session creation
        wsHandler.broadcast('session:created', {
            sessionId,
            userId,
            timestamp: new Date().toISOString()
        })
        
        res.json({
            status: 'success',
            session: {
                id: session.id,
                token: session.token,
                expiresAt: session.expiresAt
            }
        })
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to create session'
        })
    }
})

// Get session details
router.get('/:sessionId', async (req, res) => {
    const { sessionId } = req.params
    const session = sessions.get(sessionId)
    
    if (!session) {
        return res.status(404).json({
            error: 'Session not found'
        })
    }
    
    // Check if expired
    if (new Date(session.expiresAt) < new Date()) {
        removeSession(sessionId)
        return res.status(410).json({
            error: 'Session expired'
        })
    }
    
    res.json({
        session: {
            id: session.id,
            userId: session.userId,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            lastActivity: session.lastActivity,
            active: session.active,
            metadata: session.metadata
        }
    })
})

// Get all sessions for a user
router.get('/user/:userId', async (req, res) => {
    const { userId } = req.params
    
    // Clean up expired sessions
    cleanupUserSessions(userId)
    
    const userSessionIds = sessionsByUser.get(userId) || []
    const userSessions = userSessionIds
        .map(id => sessions.get(id))
        .filter(session => session && new Date(session.expiresAt) > new Date())
        .map(session => ({
            id: session.id,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            lastActivity: session.lastActivity,
            active: session.active,
            metadata: session.metadata
        }))
    
    res.json({
        sessions: userSessions,
        total: userSessions.length
    })
})

// Track activity in a session
router.post('/:sessionId/activity', async (req, res) => {
    const { sessionId } = req.params
    const { action, data = {} } = req.body
    
    const session = sessions.get(sessionId)
    
    if (!session) {
        return res.status(404).json({
            error: 'Session not found'
        })
    }
    
    // Check if expired
    if (new Date(session.expiresAt) < new Date()) {
        removeSession(sessionId)
        return res.status(410).json({
            error: 'Session expired'
        })
    }
    
    try {
        // Update last activity
        session.lastActivity = new Date().toISOString()
        
        // Add activity to log
        const activity = {
            id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            action,
            data,
            timestamp: new Date().toISOString()
        }
        
        session.activities.push(activity)
        
        // Keep only last 100 activities
        if (session.activities.length > 100) {
            session.activities = session.activities.slice(-100)
        }
        
        // Broadcast activity
        wsHandler.broadcast('session:activity', {
            sessionId,
            userId: session.userId,
            activity,
            timestamp: new Date().toISOString()
        })
        
        res.json({
            status: 'success',
            activity
        })
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to track activity'
        })
    }
})

// Refresh session (extend expiry)
router.post('/:sessionId/refresh', async (req, res) => {
    const { sessionId } = req.params
    const session = sessions.get(sessionId)
    
    if (!session) {
        return res.status(404).json({
            error: 'Session not found'
        })
    }
    
    // Check if expired
    if (new Date(session.expiresAt) < new Date()) {
        removeSession(sessionId)
        return res.status(410).json({
            error: 'Session expired'
        })
    }
    
    try {
        // Extend expiry
        session.expiresAt = new Date(Date.now() + SESSION_DURATION).toISOString()
        session.lastActivity = new Date().toISOString()
        
        // Generate new token
        session.token = `token_${crypto.randomBytes(32).toString('hex')}`
        
        res.json({
            status: 'success',
            session: {
                id: session.id,
                token: session.token,
                expiresAt: session.expiresAt
            }
        })
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to refresh session'
        })
    }
})

// End session
router.delete('/:sessionId', async (req, res) => {
    const { sessionId } = req.params
    const session = sessions.get(sessionId)
    
    if (!session) {
        return res.status(404).json({
            error: 'Session not found'
        })
    }
    
    try {
        removeSession(sessionId)
        
        // Broadcast session end
        wsHandler.broadcast('session:ended', {
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

// Get all active sessions
router.get('/', async (req, res) => {
    try {
        // Clean up all expired sessions
        cleanupAllSessions()
        
        const activeSessions = Array.from(sessions.values())
            .filter(session => new Date(session.expiresAt) > new Date())
            .map(session => ({
                id: session.id,
                userId: session.userId,
                createdAt: session.createdAt,
                expiresAt: session.expiresAt,
                lastActivity: session.lastActivity,
                active: session.active,
                metadata: session.metadata
            }))
        
        res.json({
            sessions: activeSessions,
            total: activeSessions.length,
            byUser: getSessionCountByUser()
        })
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to fetch sessions'
        })
    }
})

// Helper functions
function removeSession(sessionId) {
    const session = sessions.get(sessionId)
    if (!session) return
    
    // Remove from sessions map
    sessions.delete(sessionId)
    
    // Remove from user sessions
    const userSessions = sessionsByUser.get(session.userId) || []
    const filtered = userSessions.filter(id => id !== sessionId)
    if (filtered.length === 0) {
        sessionsByUser.delete(session.userId)
    } else {
        sessionsByUser.set(session.userId, filtered)
    }
}

function cleanupUserSessions(userId) {
    const userSessionIds = sessionsByUser.get(userId) || []
    const now = new Date()
    
    userSessionIds.forEach(sessionId => {
        const session = sessions.get(sessionId)
        if (!session || new Date(session.expiresAt) < now) {
            removeSession(sessionId)
        }
    })
}

function cleanupAllSessions() {
    const now = new Date()
    
    Array.from(sessions.keys()).forEach(sessionId => {
        const session = sessions.get(sessionId)
        if (new Date(session.expiresAt) < now) {
            removeSession(sessionId)
        }
    })
}

function getSessionCountByUser() {
    const counts = {}
    
    sessionsByUser.forEach((sessionIds, userId) => {
        const activeSessions = sessionIds.filter(id => {
            const session = sessions.get(id)
            return session && new Date(session.expiresAt) > new Date()
        })
        
        if (activeSessions.length > 0) {
            counts[userId] = activeSessions.length
        }
    })
    
    return counts
}

// Clean up expired sessions periodically
setInterval(() => {
    cleanupAllSessions()
}, 300000) // Every 5 minutes

export default router