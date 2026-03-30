/**
 * useChatSessions Hook
 *
 * Manages chat session persistence via WebSocket.
 * Sessions are stored in .frigg/chat-sessions/ within the target project,
 * gitignored by default, and recoverable across restarts.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSocket } from './useSocket'
import { useFrigg } from './useFrigg'

const log = (...args) => {
  if (process.env.NODE_ENV === 'development' || localStorage.getItem('frigg:debug') === 'true') {
    console.log('[useChatSessions]', ...args)
  }
}

/**
 * Hook for managing chat session persistence
 * @returns {Object} Chat session management functions and state
 */
export function useChatSessions() {
  const { socket, connected } = useSocket()
  const { currentRepository } = useFrigg()

  const [sessions, setSessions] = useState([])
  const [currentSession, setCurrentSession] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Track pending operations to avoid duplicates
  const pendingRef = useRef(new Set())

  // Get project path from current repository
  const projectPath = currentRepository?.path

  /**
   * Load session list (summaries) from backend
   */
  const loadSessions = useCallback(async () => {
    if (!socket || !connected || !projectPath) {
      log('Cannot load sessions: socket or projectPath not available')
      return
    }

    if (pendingRef.current.has('list')) {
      log('List operation already pending')
      return
    }

    pendingRef.current.add('list')
    setLoading(true)
    setError(null)

    log('Loading sessions for project:', projectPath)
    socket.emit('chat:session:list', { projectPath, summaryOnly: true })
  }, [socket, connected, projectPath])

  /**
   * Load a specific session by ID
   */
  const loadSession = useCallback(async (sessionId) => {
    if (!socket || !connected || !projectPath) {
      log('Cannot load session: socket or projectPath not available')
      return null
    }

    if (pendingRef.current.has(`get:${sessionId}`)) {
      log('Get operation already pending for:', sessionId)
      return null
    }

    pendingRef.current.add(`get:${sessionId}`)
    setLoading(true)
    setError(null)

    log('Loading session:', sessionId)
    socket.emit('chat:session:get', { projectPath, sessionId })

    // Return a promise that resolves when the session is loaded
    return new Promise((resolve) => {
      const handler = (data) => {
        if (data.sessionId === sessionId) {
          socket.off('chat:session:data', handler)
          resolve(data.session)
        }
      }
      socket.on('chat:session:data', handler)

      // Timeout after 10 seconds
      setTimeout(() => {
        socket.off('chat:session:data', handler)
        resolve(null)
      }, 10000)
    })
  }, [socket, connected, projectPath])

  /**
   * Save the current session
   */
  const saveSession = useCallback(async (session) => {
    if (!socket || !connected || !projectPath) {
      log('Cannot save session: socket or projectPath not available')
      return
    }

    if (!session?.id) {
      log('Cannot save session: session ID required')
      return
    }

    log('Saving session:', session.id)
    socket.emit('chat:session:save', { projectPath, session })
  }, [socket, connected, projectPath])

  /**
   * Delete a session by ID
   */
  const deleteSession = useCallback(async (sessionId) => {
    if (!socket || !connected || !projectPath) {
      log('Cannot delete session: socket or projectPath not available')
      return
    }

    log('Deleting session:', sessionId)
    socket.emit('chat:session:delete', { projectPath, sessionId })
  }, [socket, connected, projectPath])

  /**
   * Delete all sessions
   */
  const deleteAllSessions = useCallback(async () => {
    if (!socket || !connected || !projectPath) {
      log('Cannot delete sessions: socket or projectPath not available')
      return
    }

    log('Deleting all sessions')
    socket.emit('chat:session:delete', { projectPath, all: true })
  }, [socket, connected, projectPath])

  /**
   * Create a new session (in memory, not persisted until saved)
   */
  const createSession = useCallback(() => {
    const newSession = {
      id: `session-${Date.now()}`,
      messages: [],
      permissionActions: [],
      metadata: {
        repository: currentRepository?.name,
        branch: currentRepository?.git?.currentBranch
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    log('Created new session:', newSession.id)
    setCurrentSession(newSession)
    return newSession
  }, [currentRepository])

  /**
   * Switch to a different session
   */
  const switchSession = useCallback(async (sessionId) => {
    if (sessionId === currentSession?.id) {
      return currentSession
    }

    const session = await loadSession(sessionId)
    if (session) {
      setCurrentSession(session)
    }
    return session
  }, [currentSession, loadSession])

  // Set up WebSocket event listeners
  useEffect(() => {
    if (!socket) return

    const handleListResponse = (data) => {
      log('Received session list:', data.sessions?.length, 'sessions')
      pendingRef.current.delete('list')
      setSessions(data.sessions || [])
      setLoading(false)
    }

    const handleSessionData = (data) => {
      log('Received session data:', data.sessionId)
      pendingRef.current.delete(`get:${data.sessionId}`)
      if (data.session) {
        setCurrentSession(data.session)
      }
      setLoading(false)
    }

    const handleSessionSaved = (data) => {
      log('Session saved:', data.sessionId)
      // Update the session in the list
      setSessions(prev => {
        const idx = prev.findIndex(s => s.id === data.sessionId)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = { ...updated[idx], updatedAt: data.updatedAt }
          return updated
        }
        // New session, reload list
        loadSessions()
        return prev
      })
    }

    const handleSessionDeleted = (data) => {
      log('Session deleted:', data.all ? 'all' : data.sessionId)
      if (data.all) {
        setSessions([])
        setCurrentSession(null)
      } else {
        setSessions(prev => prev.filter(s => s.id !== data.sessionId))
        if (currentSession?.id === data.sessionId) {
          setCurrentSession(null)
        }
      }
    }

    const handleError = (data) => {
      console.error('[useChatSessions] Error:', data.error?.message)
      pendingRef.current.clear()
      setError(data.error?.message || 'Unknown error')
      setLoading(false)
    }

    socket.on('chat:session:list:response', handleListResponse)
    socket.on('chat:session:data', handleSessionData)
    socket.on('chat:session:saved', handleSessionSaved)
    socket.on('chat:session:deleted', handleSessionDeleted)
    socket.on('chat:session:error', handleError)

    return () => {
      socket.off('chat:session:list:response', handleListResponse)
      socket.off('chat:session:data', handleSessionData)
      socket.off('chat:session:saved', handleSessionSaved)
      socket.off('chat:session:deleted', handleSessionDeleted)
      socket.off('chat:session:error', handleError)
    }
  }, [socket, currentSession, loadSessions])

  // Load sessions when repository changes
  useEffect(() => {
    if (connected && projectPath) {
      loadSessions()
      // Clear current session when repository changes
      setCurrentSession(null)
    }
  }, [connected, projectPath, loadSessions])

  return {
    // State
    sessions,
    currentSession,
    loading,
    error,

    // Actions
    loadSessions,
    loadSession,
    saveSession,
    deleteSession,
    deleteAllSessions,
    createSession,
    switchSession,

    // Setters for direct manipulation
    setCurrentSession
  }
}

export default useChatSessions
