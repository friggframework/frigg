import React, { useState, useEffect } from 'react'
import { Clock, User, Activity, RefreshCw, XCircle } from 'lucide-react'
import { useFrigg } from '../hooks/useFrigg'
import { useSocket } from '../hooks/useSocket'
import { cn } from '../lib/utils'

const SessionMonitor = ({ userId = null }) => {
  const { users, getAllSessions, getUserSessions, refreshSession, endSession } = useFrigg()
  const { on } = useSocket()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Fetch sessions
  const fetchSessions = async () => {
    try {
      setLoading(true)
      if (userId) {
        const userSessions = await getUserSessions(userId)
        setSessions(userSessions)
      } else {
        const allSessionsData = await getAllSessions()
        setSessions(allSessionsData.sessions)
      }
    } catch (error) {
      console.error('Error fetching sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSessions()

    // Listen for session events
    const unsubscribeCreated = on('session:created', () => {
      fetchSessions()
    })

    const unsubscribeEnded = on('session:ended', () => {
      fetchSessions()
    })

    const unsubscribeActivity = on('session:activity', (data) => {
      setSessions(prev => prev.map(session => 
        session.id === data.sessionId 
          ? { ...session, lastActivity: data.timestamp }
          : session
      ))
    })

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchSessions, 30000)

    return () => {
      unsubscribeCreated && unsubscribeCreated()
      unsubscribeEnded && unsubscribeEnded()
      unsubscribeActivity && unsubscribeActivity()
      clearInterval(interval)
    }
  }, [on, userId])

  const handleRefreshSession = async (sessionId) => {
    try {
      setRefreshing(true)
      await refreshSession(sessionId)
      await fetchSessions()
    } catch (error) {
      console.error('Error refreshing session:', error)
      alert('Failed to refresh session')
    } finally {
      setRefreshing(false)
    }
  }

  const handleEndSession = async (sessionId) => {
    if (window.confirm('Are you sure you want to end this session?')) {
      try {
        await endSession(sessionId)
        await fetchSessions()
      } catch (error) {
        console.error('Error ending session:', error)
        alert('Failed to end session')
      }
    }
  }

  const getUser = (userId) => {
    return users.find(u => u.id === userId)
  }

  const formatTimeRemaining = (expiresAt) => {
    const now = new Date()
    const expiry = new Date(expiresAt)
    const diff = expiry - now
    
    if (diff < 0) return 'Expired'
    
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    return `${minutes}m`
  }

  const getTimeAgo = (timestamp) => {
    const now = new Date()
    const time = new Date(timestamp)
    const diff = now - time
    
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'Just now'
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Active Sessions</h3>
          <p className="text-sm text-gray-600 mt-1">
            {userId ? 'User sessions' : 'All active development sessions'}
          </p>
        </div>
        <button
          onClick={fetchSessions}
          disabled={refreshing}
          className={cn(
            "flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm transition-colors",
            refreshing 
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          )}
        >
          <RefreshCw size={14} className={cn(refreshing && "animate-spin")} />
          <span>Refresh</span>
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <User size={32} className="mx-auto mb-2 text-gray-400" />
          <p>No active sessions</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => {
            const user = getUser(session.userId)
            const isExpiring = new Date(session.expiresAt) - new Date() < 600000 // Less than 10 minutes

            return (
              <div
                key={session.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <User size={16} className="text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {user ? `${user.firstName} ${user.lastName}` : 'Unknown User'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {user?.email || session.userId}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-4 text-xs">
                      <div className="flex items-center space-x-1 text-gray-600">
                        <Clock size={12} />
                        <span>Created {getTimeAgo(session.createdAt)}</span>
                      </div>
                      <div className="flex items-center space-x-1 text-gray-600">
                        <Activity size={12} />
                        <span>Active {getTimeAgo(session.lastActivity)}</span>
                      </div>
                      <div className={cn(
                        "flex items-center space-x-1",
                        isExpiring ? "text-orange-600" : "text-gray-600"
                      )}>
                        <Clock size={12} />
                        <span>Expires in {formatTimeRemaining(session.expiresAt)}</span>
                      </div>
                    </div>

                    {session.metadata && Object.keys(session.metadata).length > 0 && (
                      <div className="mt-2 text-xs text-gray-500">
                        <span className="font-medium">Metadata:</span> {JSON.stringify(session.metadata)}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => handleRefreshSession(session.id)}
                      disabled={refreshing}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Refresh session"
                    >
                      <RefreshCw size={16} />
                    </button>
                    <button
                      onClick={() => handleEndSession(session.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="End session"
                    >
                      <XCircle size={16} />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs">
                  <code className="text-gray-500 font-mono">
                    {session.id}
                  </code>
                  <span className={cn(
                    "px-2 py-0.5 rounded-full font-medium",
                    session.active 
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600"
                  )}>
                    {session.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-6 text-xs text-gray-500 text-center">
        Sessions automatically expire after 1 hour of inactivity
      </div>
    </div>
  )
}

export default SessionMonitor