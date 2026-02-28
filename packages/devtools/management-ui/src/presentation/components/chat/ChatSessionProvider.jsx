/**
 * ChatSessionProvider - Chat Session Persistence Context
 *
 * Provides chat session persistence functionality to the Build Zone.
 * Wraps children with a context that exposes session management functions.
 *
 * This works alongside FriggRuntimeProvider - it manages persistence
 * while FriggRuntimeProvider manages the assistant-ui runtime.
 */

import React, { createContext, useContext, useCallback, useEffect, useRef } from 'react'
import { useChatSessions } from '../../hooks/useChatSessions'
import { useThreadRuntime, useMessage } from '@assistant-ui/react'

// Create context for chat session persistence
const ChatSessionContext = createContext({
  sessions: [],
  currentSession: null,
  loading: false,
  error: null,
  loadSessions: () => {},
  loadSession: () => {},
  saveCurrentSession: () => {},
  deleteSession: () => {},
  deleteAllSessions: () => {},
  startNewSession: () => {},
  switchToSession: () => {},
})

export const useChatSessionContext = () => useContext(ChatSessionContext)

/**
 * Debounce helper
 */
function debounce(fn, delay) {
  let timeoutId
  return (...args) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

/**
 * ChatSessionProvider component
 *
 * Provides session persistence context and auto-saves conversations.
 */
export function ChatSessionProvider({ children, onSessionChange }) {
  const chatSessions = useChatSessions()
  const {
    sessions,
    currentSession,
    loading,
    error,
    loadSessions,
    loadSession,
    saveSession,
    deleteSession,
    deleteAllSessions,
    createSession,
    switchSession,
    setCurrentSession
  } = chatSessions

  // Track if we need to save (messages changed)
  const pendingSaveRef = useRef(false)
  const lastSavedRef = useRef(null)

  /**
   * Save the current session with the latest messages
   * Called when messages change or periodically
   */
  const saveCurrentSession = useCallback((messages, permissionActions = []) => {
    if (!currentSession) return

    const sessionToSave = {
      ...currentSession,
      messages: messages || currentSession.messages || [],
      permissionActions: permissionActions || currentSession.permissionActions || [],
      updatedAt: Date.now()
    }

    // Only save if something changed
    const serialized = JSON.stringify(sessionToSave)
    if (serialized === lastSavedRef.current) {
      return
    }

    lastSavedRef.current = serialized
    saveSession(sessionToSave)
  }, [currentSession, saveSession])

  // Debounced save to avoid excessive writes
  const debouncedSave = useCallback(
    debounce((messages, permissionActions) => {
      saveCurrentSession(messages, permissionActions)
    }, 2000),
    [saveCurrentSession]
  )

  /**
   * Start a new chat session
   */
  const startNewSession = useCallback(() => {
    const newSession = createSession()
    if (onSessionChange) {
      onSessionChange(newSession)
    }
    return newSession
  }, [createSession, onSessionChange])

  /**
   * Switch to a different session
   */
  const switchToSession = useCallback(async (sessionId) => {
    const session = await switchSession(sessionId)
    if (session && onSessionChange) {
      onSessionChange(session)
    }
    return session
  }, [switchSession, onSessionChange])

  // Initialize with a new session if none exists
  useEffect(() => {
    // Wait for sessions to load, then create one if empty
    if (!loading && sessions.length === 0 && !currentSession) {
      // No sessions exist, create a new one
      startNewSession()
    }
  }, [loading, sessions.length, currentSession, startNewSession])

  const contextValue = {
    // State from hook
    sessions,
    currentSession,
    loading,
    error,

    // Actions
    loadSessions,
    loadSession,
    saveCurrentSession,
    debouncedSave,
    deleteSession,
    deleteAllSessions,
    startNewSession,
    switchToSession,

    // Direct access to set session (for restoring from runtime)
    setCurrentSession
  }

  return (
    <ChatSessionContext.Provider value={contextValue}>
      {children}
    </ChatSessionContext.Provider>
  )
}

/**
 * AutoSaveMessages component
 *
 * Placed inside AssistantRuntimeProvider to access thread state
 * and auto-save messages when they change.
 */
export function AutoSaveMessages({ permissionActions = [] }) {
  const { debouncedSave, currentSession } = useChatSessionContext()

  // We need to use the runtime to get messages
  // This component should be rendered inside AssistantRuntimeProvider
  // For now, we'll rely on manual saves or external message tracking

  // The actual auto-save will be triggered by FriggRuntimeProvider
  // when it processes messages through the model adapter

  return null
}

export default ChatSessionProvider
