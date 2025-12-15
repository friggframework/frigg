/**
 * Frigg AI Runtime Provider
 *
 * Provides assistant-ui runtime connected to WebSocket backend.
 * Streams responses incrementally as they arrive.
 * Maintains conversation history for context persistence.
 * Handles permission requests for tool approvals.
 */

import React, { useMemo, useRef, useState, useEffect, useCallback, createContext, useContext } from 'react'
import { useLocalRuntime, AssistantRuntimeProvider } from '@assistant-ui/react'
import { useSocket } from '../../hooks/useSocket'
import { useAISettings } from '../../hooks/useAISettings'
import { useFrigg } from '../../hooks/useFrigg'
import { FriggToolUIs } from './ToolUIs'

// Context for permission requests
const PermissionContext = createContext({
  pendingPermissions: [],
  permissionActions: [], // History of approval/denial actions (keyed by toolName for inline display)
  approvePermission: () => {},
  denyPermission: () => {},
  clearPermissionActions: () => {},
  getActionForTool: () => null // Get permission action for a specific tool call
})

export const usePermissions = () => useContext(PermissionContext)

// Enable verbose logging for debugging
const VERBOSE_LOG = process.env.NODE_ENV === 'development' ||
  localStorage.getItem('frigg:debug') === 'true'

const log = (...args) => {
  if (VERBOSE_LOG) console.log('[FriggRuntime]', ...args)
}

/**
 * Format messages array into a conversation string for the prompt
 * This maintains context between messages
 */
const formatConversationHistory = (messages) => {
  return messages.map(msg => {
    const role = msg.role === 'user' ? 'Human' : 'Assistant'
    const content = msg.content
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join('\n')
    return `${role}: ${content}`
  }).join('\n\n')
}

/**
 * Create a ChatModelAdapter that streams via WebSocket
 * Maintains conversation history for context persistence
 *
 * NOTE: Permission actions are tracked separately and rendered inline
 * but NOT included in the conversation context sent to the AI.
 */
const createFriggModelAdapter = ({ socket, aiConfig, projectPath, sessionIdRef }) => ({
  async *run({ messages, abortSignal }) {
    const latestMessage = messages[messages.length - 1]
    if (!latestMessage || latestMessage.role !== 'user') return

    // Build the full conversation prompt with history
    // This maintains context between messages
    const conversationHistory = formatConversationHistory(messages)

    log('Messages in conversation:', messages.length)
    log('Conversation history:', conversationHistory.substring(0, 500) + '...')

    if (!conversationHistory.trim()) return

    // Reuse session ID for conversation continuity, or create new one
    if (!sessionIdRef.current) {
      sessionIdRef.current = `session-${Date.now()}`
    }
    const sessionId = sessionIdRef.current
    log('Using session:', sessionId)

    // Use an async queue to yield events as they arrive
    const eventQueue = []
    let resolveNext = null
    let isDone = false
    let error = null

    const pushEvent = (event) => {
      if (resolveNext) {
        resolveNext(event)
        resolveNext = null
      } else {
        eventQueue.push(event)
      }
    }

    const waitForEvent = () => new Promise((resolve) => {
      if (eventQueue.length > 0) {
        resolve(eventQueue.shift())
      } else {
        resolveNext = resolve
      }
    })

    // Track accumulated state
    let textContent = ''
    let toolCalls = []

    const handleEvent = (event) => {
      if (event.sessionId !== sessionId) return
      pushEvent(event)
    }

    const handleStarted = (data) => {
      if (data.sessionId !== sessionId) return
      console.log('[FriggRuntime] Session started:', sessionId)
    }

    const handleError = (data) => {
      if (data.sessionId && data.sessionId !== sessionId) return
      error = new Error(data.error?.message || 'Agent error')
      pushEvent({ type: 'error' })
    }

    // Set up listeners
    socket.on('agent:event', handleEvent)
    socket.on('agent:started', handleStarted)
    socket.on('agent:error', handleError)

    const cleanup = () => {
      socket.off('agent:event', handleEvent)
      socket.off('agent:started', handleStarted)
      socket.off('agent:error', handleError)
    }

    // Handle abort
    abortSignal?.addEventListener('abort', () => {
      socket.emit('agent:stop', { sessionId })
      cleanup()
      isDone = true
      pushEvent({ type: 'abort' })
    })

    // Start the agent session with full conversation history
    log('Emitting agent:start with conversation history')
    socket.emit('agent:start', {
      sessionId,
      prompt: conversationHistory, // Send full conversation, not just last message
      projectPath,
      config: {
        provider: aiConfig?.provider || 'claude-code',
        model: aiConfig?.model || 'claude-sonnet-4-20250514',
        role: aiConfig?.role || 'coder',
        requireApproval: aiConfig?.requireApproval ?? true,
      }
    })

    try {
      // Process events as they arrive
      while (!isDone) {
        const event = await waitForEvent()

        switch (event.type) {
          case 'content':
            // Add separator if there's existing content (multiple content events)
            if (textContent && event.content) {
              // Ensure proper paragraph separation between content blocks
              const trimmedExisting = textContent.trimEnd()
              const trimmedNew = (event.content || '').trimStart()

              // If neither ends/starts with double newline, add paragraph break
              if (!trimmedExisting.endsWith('\n\n') && !trimmedNew.startsWith('\n')) {
                textContent = trimmedExisting + '\n\n'
              } else {
                textContent = trimmedExisting + '\n'
              }
              textContent += trimmedNew
            } else {
              textContent += event.content || ''
            }
            log('Content accumulated, length:', textContent.length)
            // Yield update with current text
            yield {
              content: [
                { type: 'text', text: textContent },
                ...toolCalls
              ]
            }
            break

          case 'tool_call':
            toolCalls.push({
              type: 'tool-call',
              toolCallId: event.toolUseId || `tool-${Date.now()}`,
              toolName: event.name,
              args: event.args,
            })
            yield {
              content: [
                { type: 'text', text: textContent },
                ...toolCalls
              ]
            }
            break

          case 'tool_result':
            const idx = toolCalls.findIndex(t => t.toolName === event.name)
            if (idx >= 0) {
              toolCalls[idx].result = event.result
            }
            break

          case 'done':
            isDone = true
            break

          case 'error':
            cleanup()
            throw error || new Error('Agent error')

          case 'abort':
            cleanup()
            throw new Error('Request cancelled')
        }
      }

      // Final yield
      cleanup()
      if (textContent || toolCalls.length > 0) {
        yield {
          content: [
            ...(textContent ? [{ type: 'text', text: textContent }] : []),
            ...toolCalls
          ]
        }
      }

    } catch (e) {
      cleanup()
      throw e
    }
  }
})

/**
 * FriggRuntimeProvider - Wraps children with assistant-ui runtime
 * Maintains session reference for conversation continuity
 * Manages permission requests for tool approvals
 */
export function FriggRuntimeProvider({ children, onNewSession }) {
  const { socket, connected } = useSocket()
  const { aiConfig } = useAISettings()
  const { currentRepository } = useFrigg()

  // Keep session ID stable across renders for conversation continuity
  const sessionIdRef = useRef(null)

  // Permission requests state
  const [pendingPermissions, setPendingPermissions] = useState([])
  // History of permission actions (for display in chat)
  const [permissionActions, setPermissionActions] = useState([])

  // Reset session when repository changes
  const prevRepoPath = useRef(currentRepository?.path)
  useEffect(() => {
    if (prevRepoPath.current !== currentRepository?.path) {
      log('Repository changed, resetting session and permissions')
      sessionIdRef.current = null
      prevRepoPath.current = currentRepository?.path
      // Clear permission state for the new repository
      setPendingPermissions([])
      setPermissionActions([])
    }
  }, [currentRepository?.path])

  // Handle permission request events from backend
  useEffect(() => {
    if (!socket) return

    const handlePermissionRequest = (event) => {
      log('Permission request received:', event)
      setPendingPermissions(prev => {
        // Avoid duplicates
        if (prev.find(p => p.requestId === event.requestId)) {
          return prev
        }
        return [...prev, event]
      })
    }

    const handlePermissionAck = (event) => {
      log('Permission response acknowledged:', event.requestId)
      setPendingPermissions(prev =>
        prev.filter(p => p.requestId !== event.requestId)
      )
    }

    socket.on('agent:permission_request', handlePermissionRequest)
    socket.on('agent:permission_response:ack', handlePermissionAck)

    return () => {
      socket.off('agent:permission_request', handlePermissionRequest)
      socket.off('agent:permission_response:ack', handlePermissionAck)
    }
  }, [socket])

  // Approve a permission request
  const approvePermission = useCallback((requestId) => {
    if (!socket) return

    // Find the permission to get details for the action record
    const permission = pendingPermissions.find(p => p.requestId === requestId)

    log('Approving permission:', requestId)
    socket.emit('agent:permission_response', {
      requestId,
      allow: true
    })

    // Record the action for display in chat (keyed by toolUseId for inline rendering)
    if (permission) {
      setPermissionActions(prev => [...prev, {
        id: `action-${Date.now()}`,
        type: 'approved',
        toolName: permission.toolName,
        toolUseId: permission.toolUseId, // Link to specific tool call
        description: permission.description,
        timestamp: Date.now()
      }])
    }

    // Remove from pending
    setPendingPermissions(prev =>
      prev.filter(p => p.requestId !== requestId)
    )
  }, [socket, pendingPermissions])

  // Deny a permission request
  const denyPermission = useCallback((requestId, message) => {
    if (!socket) return

    // Find the permission to get details for the action record
    const permission = pendingPermissions.find(p => p.requestId === requestId)

    log('Denying permission:', requestId)
    socket.emit('agent:permission_response', {
      requestId,
      allow: false,
      message: message || 'User denied permission'
    })

    // Record the action for display in chat (keyed by toolUseId for inline rendering)
    if (permission) {
      setPermissionActions(prev => [...prev, {
        id: `action-${Date.now()}`,
        type: 'denied',
        toolName: permission.toolName,
        toolUseId: permission.toolUseId, // Link to specific tool call
        description: permission.description,
        reason: message,
        timestamp: Date.now()
      }])
    }

    // Remove from pending
    setPendingPermissions(prev =>
      prev.filter(p => p.requestId !== requestId)
    )
  }, [socket, pendingPermissions])

  // Clear permission actions (e.g., when starting new conversation)
  const clearPermissionActions = useCallback(() => {
    setPermissionActions([])
  }, [])

  // Get permission action for a specific tool call (for inline rendering)
  const getActionForTool = useCallback((toolCallId, toolName) => {
    // First try to match by toolUseId if available
    const byId = permissionActions.find(a => a.toolUseId === toolCallId)
    if (byId) return byId
    // Fall back to matching by toolName (for older actions without toolUseId)
    return permissionActions.find(a => a.toolName === toolName)
  }, [permissionActions])

  const modelAdapter = useMemo(() => {
    if (!socket || !connected) {
      return {
        async *run() {
          throw new Error('Not connected to server')
        }
      }
    }
    return createFriggModelAdapter({
      socket,
      aiConfig,
      projectPath: currentRepository?.path,
      sessionIdRef
    })
  }, [socket, connected, aiConfig, currentRepository?.path])

  const runtime = useLocalRuntime(modelAdapter)

  // Expose current session ID
  if (onNewSession && sessionIdRef.current) {
    onNewSession(sessionIdRef.current)
  }

  const permissionContextValue = useMemo(() => ({
    pendingPermissions,
    permissionActions,
    approvePermission,
    denyPermission,
    clearPermissionActions,
    getActionForTool
  }), [pendingPermissions, permissionActions, approvePermission, denyPermission, clearPermissionActions, getActionForTool])

  return (
    <PermissionContext.Provider value={permissionContextValue}>
      <AssistantRuntimeProvider runtime={runtime}>
        {/* Register custom tool UIs */}
        <FriggToolUIs />
        {children}
      </AssistantRuntimeProvider>
    </PermissionContext.Provider>
  )
}

export default FriggRuntimeProvider
