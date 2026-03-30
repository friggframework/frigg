/**
 * ChatSessionsSidebar - Manages chat session threads
 *
 * Provides:
 * - List of chat sessions/threads
 * - Session persistence via WebSocket to .frigg/chat-sessions/
 * - Git branch context with warnings
 * - Hint to use IDE agent for detailed threading
 */

import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import {
  useAssistantRuntime,
  useThreadRuntime,
} from '@assistant-ui/react'
import { cn } from '../../../lib/utils'
import { useFrigg } from '../../hooks/useFrigg'
import { useChatSessions } from '../../hooks/useChatSessions'
import { Button } from '../ui/button'
import {
  MessageSquare,
  Plus,
  GitBranch,
  AlertTriangle,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Clock,
  MoreVertical,
  Loader2,
} from 'lucide-react'

/**
 * Session data structure (stored in .frigg/chat-sessions/):
 * {
 *   id: string,
 *   messages: Array<ChatMessage>,
 *   permissionActions: Array<PermissionAction>,
 *   metadata: { branch, repository },
 *   createdAt: number,
 *   updatedAt: number
 * }
 *
 * Summary structure (for list view):
 * {
 *   id: string,
 *   preview: string,
 *   messageCount: number,
 *   createdAt: number,
 *   updatedAt: number,
 *   metadata: { branch, repository }
 * }
 */

/**
 * Generate a session name from first user message or preview
 */
const getSessionName = (session, index) => {
  // Use preview from summaries (from backend)
  if (session.preview && session.preview !== 'Empty conversation') {
    return session.preview.length > 30
      ? session.preview.substring(0, 30) + '...'
      : session.preview
  }

  // Fall back to extracting from messages
  if (session.messages?.length > 0) {
    const firstUserMessage = session.messages.find(m => m.role === 'user')
    const textContent = firstUserMessage?.content?.find(c => c.type === 'text')
    if (textContent?.text) {
      const text = textContent.text
      return text.length > 30 ? text.substring(0, 30) + '...' : text
    }
  }

  return `Chat ${index + 1}`
}

/**
 * Format timestamp for display
 */
const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date

  // Less than 1 hour
  if (diff < 60 * 60 * 1000) {
    const mins = Math.floor(diff / (60 * 1000))
    return `${mins}m ago`
  }

  // Less than 24 hours
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000))
    return `${hours}h ago`
  }

  // Less than 7 days
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000))
    return `${days}d ago`
  }

  // Show date
  return date.toLocaleDateString()
}

/**
 * Individual session item component
 */
const SessionItem = ({
  session,
  isActive,
  currentBranch,
  onSelect,
  onDelete,
}) => {
  const [showMenu, setShowMenu] = useState(false)
  const branchMismatch = session.branch && currentBranch && session.branch !== currentBranch

  return (
    <div
      className={cn(
        'group relative flex items-start gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors',
        isActive
          ? 'bg-purple-500/10 border border-purple-500/30'
          : 'hover:bg-muted/50 border border-transparent'
      )}
      onClick={() => onSelect(session)}
    >
      <MessageSquare
        className={cn(
          'w-4 h-4 mt-0.5 flex-shrink-0',
          isActive ? 'text-purple-500' : 'text-muted-foreground'
        )}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'text-sm font-medium truncate',
              isActive ? 'text-foreground' : 'text-foreground/80'
            )}
          >
            {session.name}
          </span>
          {branchMismatch && (
            <AlertTriangle
              className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0"
              title={`Session was on branch "${session.branch}", current branch is "${currentBranch}"`}
            />
          )}
        </div>

        <div className="flex items-center gap-2 mt-0.5">
          {session.branch && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <GitBranch className="w-3 h-3" />
              <span className="truncate max-w-[80px]">{session.branch}</span>
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {formatTime(session.updatedAt)}
          </span>
        </div>
      </div>

      {/* Actions menu */}
      <div className="relative">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity',
            showMenu && 'opacity-100'
          )}
          onClick={(e) => {
            e.stopPropagation()
            setShowMenu(!showMenu)
          }}
        >
          <MoreVertical className="w-4 h-4 text-muted-foreground" />
        </Button>

        {showMenu && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowMenu(false)}
            />
            <div className="absolute right-0 top-full mt-1 z-20 bg-popover border border-border rounded-md shadow-md py-1 min-w-[120px]">
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/10"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(session.id)
                  setShowMenu(false)
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Branch warning banner
 */
const BranchWarning = ({ sessionBranch, currentBranch }) => (
  <div className="mx-3 mb-3 p-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
    <div className="flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
      <div className="text-xs">
        <p className="font-medium text-yellow-600 dark:text-yellow-400">
          Branch Mismatch
        </p>
        <p className="text-yellow-600/80 dark:text-yellow-400/80 mt-0.5">
          This session was on <code className="bg-yellow-500/20 px-1 rounded">{sessionBranch}</code>,
          but you're now on <code className="bg-yellow-500/20 px-1 rounded">{currentBranch}</code>.
          Code changes may not apply correctly.
        </p>
      </div>
    </div>
  </div>
)

/**
 * IDE hint banner
 */
const IDEHint = () => (
  <div className="mx-3 mt-auto mb-3 p-2.5 bg-blue-500/10 border border-blue-500/30 rounded-lg">
    <div className="flex items-start gap-2">
      <Cpu className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
      <div className="text-xs">
        <p className="font-medium text-blue-600 dark:text-blue-400">
          Need detailed AI assistance?
        </p>
        <p className="text-blue-600/80 dark:text-blue-400/80 mt-0.5">
          For complex tasks with file editing, use an AI agent in your IDE (Cursor, VS Code + Claude).
          IDE agents have better context and can edit files directly.
        </p>
      </div>
    </div>
  </div>
)

/**
 * Main ChatSessionsSidebar component
 */
export function ChatSessionsSidebar({ className, collapsed, onCollapsedChange }) {
  const runtime = useAssistantRuntime()
  const threadRuntime = useThreadRuntime()
  const { currentRepository } = useFrigg()

  // Use WebSocket-based chat sessions hook
  const {
    sessions,
    currentSession,
    loading,
    error,
    saveSession,
    deleteSession,
    createSession,
    switchSession,
    loadSession,
  } = useChatSessions()

  const lastMessageCountRef = useRef(0)
  const isCreatingSessionRef = useRef(false)
  const isSwitchingSessionRef = useRef(false)
  const prevRepoPathRef = useRef(currentRepository?.path)

  // Get current git branch
  const currentBranch = currentRepository?.git?.currentBranch ||
    currentRepository?.gitBranch ||
    currentRepository?.branch

  // Reset thread when repository changes
  useEffect(() => {
    if (prevRepoPathRef.current !== currentRepository?.path) {
      console.log('[ChatSessionsSidebar] Repository changed, resetting thread')
      prevRepoPathRef.current = currentRepository?.path
      lastMessageCountRef.current = 0

      // Reset the thread to clear old messages
      if (runtime) {
        runtime.switchToNewThread()
      }
    }
  }, [currentRepository?.path, runtime])

  // Subscribe to thread state changes to detect new messages and auto-save
  useEffect(() => {
    if (!threadRuntime || !currentSession) return

    const unsubscribe = threadRuntime.subscribe(() => {
      const state = threadRuntime.getState()
      const messages = state?.messages || []
      const messageCount = messages.length

      // Skip during session switching
      if (isSwitchingSessionRef.current) return

      // If messages changed, save the session
      if (messageCount > 0 && messageCount !== lastMessageCountRef.current) {
        lastMessageCountRef.current = messageCount

        // Debounce saves by checking if we're already saving
        try {
          const exported = threadRuntime.export?.()
          if (exported) {
            saveSession({
              ...currentSession,
              messages: exported.messages || messages,
              updatedAt: Date.now(),
              metadata: {
                ...currentSession.metadata,
                branch: currentBranch,
                repository: currentRepository?.name
              }
            })
          }
        } catch (error) {
          console.error('Failed to save session on message change:', error)
        }
      }
    })

    return () => unsubscribe?.()
  }, [threadRuntime, currentSession, currentBranch, currentRepository?.name, saveSession])

  // Create a session automatically when messages start and no session exists
  useEffect(() => {
    if (!threadRuntime || currentSession || isCreatingSessionRef.current) return

    const unsubscribe = threadRuntime.subscribe(() => {
      const state = threadRuntime.getState()
      const messages = state?.messages || []

      if (messages.length > 0 && !currentSession && !isCreatingSessionRef.current) {
        isCreatingSessionRef.current = true
        createSession()
        setTimeout(() => {
          isCreatingSessionRef.current = false
        }, 100)
      }
    })

    return () => unsubscribe?.()
  }, [threadRuntime, currentSession, createSession])

  // Create a new session
  const handleNewSession = useCallback(() => {
    // Save current session first if it has messages
    if (currentSession && threadRuntime) {
      try {
        const exported = threadRuntime.export?.()
        if (exported?.messages?.length > 0) {
          saveSession({
            ...currentSession,
            messages: exported.messages,
            updatedAt: Date.now()
          })
        }
      } catch (error) {
        console.error('Failed to save current session before creating new:', error)
      }
    }

    // Create new session
    createSession()
    lastMessageCountRef.current = 0

    // Reset the thread to start fresh
    if (runtime) {
      runtime.switchToNewThread()
    }
  }, [currentSession, threadRuntime, runtime, saveSession, createSession])

  // Select a session
  const handleSelectSession = useCallback(async (session) => {
    if (session.id === currentSession?.id) return

    isSwitchingSessionRef.current = true

    // Save current session first if it has messages
    if (currentSession && threadRuntime) {
      try {
        const exported = threadRuntime.export?.()
        if (exported?.messages?.length > 0) {
          saveSession({
            ...currentSession,
            messages: exported.messages,
            updatedAt: Date.now()
          })
        }
      } catch (error) {
        console.error('Failed to save current session before switching:', error)
      }
    }

    // Load the full session data (summaries don't have messages)
    const fullSession = await loadSession(session.id)

    if (fullSession?.messages && threadRuntime) {
      try {
        // Import messages into the thread runtime
        threadRuntime.import({ messages: fullSession.messages })
        lastMessageCountRef.current = fullSession.messages.length
      } catch (error) {
        console.error('Failed to load session messages:', error)
        runtime?.switchToNewThread()
        lastMessageCountRef.current = 0
      }
    } else if (runtime) {
      runtime.switchToNewThread()
      lastMessageCountRef.current = 0
    }

    // Switch session after loading (this updates currentSession)
    await switchSession(session.id)

    setTimeout(() => {
      isSwitchingSessionRef.current = false
    }, 100)
  }, [currentSession, runtime, threadRuntime, saveSession, loadSession, switchSession])

  // Delete a session
  const handleDeleteSession = useCallback(async (sessionId) => {
    const wasActive = sessionId === currentSession?.id

    // Delete from backend
    await deleteSession(sessionId)

    // If we deleted the active session, switch to next one or create new
    if (wasActive) {
      const remainingSessions = sessions.filter(s => s.id !== sessionId)

      if (remainingSessions.length > 0) {
        await handleSelectSession(remainingSessions[0])
      } else {
        // No sessions left, create a new one
        createSession()
        runtime?.switchToNewThread()
        lastMessageCountRef.current = 0
      }
    }
  }, [currentSession?.id, sessions, deleteSession, handleSelectSession, createSession, runtime])

  // Prepare session list with display names
  const sessionsWithNames = useMemo(() => {
    return sessions.map((session, index) => ({
      ...session,
      name: getSessionName(session, index),
      branch: session.metadata?.branch
    }))
  }, [sessions])

  // Check for branch mismatch warning
  const showBranchWarning = currentSession?.metadata?.branch &&
    currentBranch &&
    currentSession.metadata.branch !== currentBranch

  // Collapsed view
  if (collapsed) {
    return (
      <div className={cn('w-12 border-r border-border flex flex-col items-center py-2 gap-2', className)}>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onCollapsedChange?.(false)}
          title="Expand sidebar"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleNewSession}
          title="New chat"
        >
          <Plus className="w-4 h-4" />
        </Button>

        <div className="flex-1 flex flex-col gap-1 overflow-y-auto w-full px-1">
          {loading ? (
            <div className="flex justify-center py-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            sessionsWithNames.slice(0, 10).map((session, i) => (
              <Button
                key={session.id}
                variant={session.id === currentSession?.id ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleSelectSession(session)}
                title={session.name}
              >
                <span className="text-xs">{i + 1}</span>
              </Button>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('w-64 border-r border-border flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-sm font-medium">Chat Sessions</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleNewSession}
            title="New chat"
          >
            <Plus className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onCollapsedChange?.(true)}
            title="Collapse sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Branch warning */}
      {showBranchWarning && (
        <BranchWarning
          sessionBranch={currentSession.metadata.branch}
          currentBranch={currentBranch}
        />
      )}

      {/* Error display */}
      {error && (
        <div className="mx-3 mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
        {loading && sessionsWithNames.length === 0 ? (
          <div className="text-center py-8 px-4">
            <Loader2 className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2 animate-spin" />
            <p className="text-sm text-muted-foreground">Loading sessions...</p>
          </div>
        ) : sessionsWithNames.length === 0 ? (
          <div className="text-center py-8 px-4">
            <MessageSquare className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No chat sessions yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Start a conversation to create your first session
            </p>
          </div>
        ) : (
          sessionsWithNames.map(session => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === currentSession?.id}
              currentBranch={currentBranch}
              onSelect={handleSelectSession}
              onDelete={handleDeleteSession}
            />
          ))
        )}
      </div>

      {/* IDE hint */}
      <IDEHint />
    </div>
  )
}

export default ChatSessionsSidebar
