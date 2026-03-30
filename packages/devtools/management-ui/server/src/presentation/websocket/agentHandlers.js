/**
 * WebSocket Handlers for AI Agent Communication
 *
 * Handles real-time communication between the Build Zone UI and the
 * Claude Agent SDK backend.
 */

// Enable verbose logging via DEBUG env var or at runtime
let VERBOSE = process.env.DEBUG === 'true' ||
  process.env.DEBUG_AGENT === 'true' ||
  process.env.VERBOSE === 'true'

// Runtime toggle for debug mode (per-socket tracking)
const debugSockets = new Set()

const log = (...args) => console.log('[Agent]', ...args)
const verbose = (socketId, ...args) => {
  if (VERBOSE || debugSockets.has(socketId)) {
    console.log('[Agent:Verbose]', ...args)
  }
}

// Enable/disable verbose logging at runtime
export function setVerboseLogging(enabled) {
  VERBOSE = enabled
  log(`Verbose logging ${enabled ? 'ENABLED' : 'DISABLED'} globally`)
}

/**
 * Setup agent-related WebSocket event handlers
 * @param {Object} params
 * @param {Object} params.io - Socket.io server instance
 * @param {Object} params.startAgentSessionUseCase - Use case for starting sessions
 * @param {Object} params.stopAgentSessionUseCase - Use case for stopping sessions
 * @param {Object} params.getAgentSessionStatusUseCase - Use case for getting status
 * @param {Object} params.claudeAgentAdapter - The Claude Agent adapter
 * @param {Object} params.approveProposalUseCase - Use case for approving proposals
 * @param {Object} params.rejectProposalUseCase - Use case for rejecting proposals
 * @param {Object} params.rollbackProposalUseCase - Use case for rolling back proposals
 */
export function setupAgentHandlers({
  io,
  startAgentSessionUseCase,
  stopAgentSessionUseCase,
  getAgentSessionStatusUseCase,
  claudeAgentAdapter,
  approveProposalUseCase,
  rejectProposalUseCase,
  rollbackProposalUseCase
}) {
  io.on('connection', (socket) => {
    log(`Client connected: ${socket.id}`)

    /**
     * Start a new agent session
     * Payload: { sessionId, prompt, config: { provider, model, role, requireApproval } }
     */
    socket.on('agent:start', async (data) => {
      try {
        const { sessionId, prompt, projectPath, config } = data

        verbose(socket.id, 'Received agent:start', {
          sessionId,
          projectPath,
          promptLength: prompt?.length,
          promptPreview: prompt?.substring(0, 200) + '...',
          config
        })

        if (!sessionId || !prompt) {
          socket.emit('agent:error', {
            sessionId,
            error: { message: 'Session ID and prompt are required' }
          })
          return
        }

        // Only claude-code provider is supported
        if (config?.provider && config.provider !== 'claude-code') {
          socket.emit('agent:error', {
            sessionId,
            error: { message: 'Only claude-code provider is supported' }
          })
          return
        }

        log(`Starting session ${sessionId} for socket ${socket.id} in ${projectPath || 'default path'}`)
        verbose(socket.id, 'Full prompt:', prompt)

        // Start the session with the use case
        await startAgentSessionUseCase.execute({
          sessionId,
          prompt,
          projectPath,
          config,
          socketId: socket.id
        })

        // Acknowledge session started
        socket.emit('agent:started', { sessionId })

      } catch (error) {
        console.error(`[Agent] Error starting session:`, error)
        socket.emit('agent:error', {
          sessionId: data?.sessionId,
          error: { message: error.message }
        })
      }
    })

    /**
     * Stop an active agent session
     * Payload: { sessionId }
     */
    socket.on('agent:stop', async (data) => {
      try {
        const { sessionId } = data

        if (!sessionId) {
          socket.emit('agent:error', {
            error: { message: 'Session ID is required' }
          })
          return
        }

        console.log(`[Agent] Stopping session ${sessionId}`)

        const result = await stopAgentSessionUseCase.execute({ sessionId })

        socket.emit('agent:stopped', result)

      } catch (error) {
        console.error(`[Agent] Error stopping session:`, error)
        socket.emit('agent:error', {
          sessionId: data?.sessionId,
          error: { message: error.message }
        })
      }
    })

    /**
     * Get status of agent availability or a specific session
     * Payload: { sessionId? } or { provider? }
     *
     * If sessionId is provided, returns session status
     * If no sessionId, returns agent availability status
     */
    socket.on('agent:status', async (data) => {
      try {
        const { sessionId, provider } = data || {}

        // If sessionId provided, check specific session
        if (sessionId) {
          const result = await getAgentSessionStatusUseCase.execute({ sessionId })
          socket.emit('agent:status:response', result)
          return
        }

        // Otherwise, check general agent availability
        const availability = await claudeAgentAdapter.checkAvailability(provider)
        socket.emit('agent:status:response', {
          available: availability.available,
          error: availability.error || null,
          provider: provider || 'claude-code'
        })

      } catch (error) {
        console.error(`[Agent] Error getting status:`, error)
        socket.emit('agent:status:response', {
          available: false,
          error: error.message
        })
      }
    })

    /**
     * Get available agent roles
     */
    socket.on('agent:roles', () => {
      const roles = claudeAgentAdapter.getAvailableRoles()
      socket.emit('agent:roles:response', roles)
    })

    /**
     * Approve pending changes
     * Payload: { sessionId, proposalId, userId? }
     */
    socket.on('agent:approve', async (data) => {
      try {
        const { sessionId, proposalId, userId } = data

        if (!proposalId) {
          socket.emit('agent:error', {
            sessionId,
            error: { message: 'Proposal ID is required' }
          })
          return
        }

        console.log(`[Agent] Approve request for session ${sessionId}, proposal ${proposalId}`)

        const result = await approveProposalUseCase.execute({
          proposalId,
          sessionId,
          userId
        })

        socket.emit('agent:approved', {
          sessionId,
          proposalId,
          proposal: result.proposal,
          result: result.result
        })

      } catch (error) {
        console.error(`[Agent] Error approving proposal:`, error)
        socket.emit('agent:error', {
          sessionId: data?.sessionId,
          proposalId: data?.proposalId,
          error: { message: error.message }
        })
      }
    })

    /**
     * Reject pending changes
     * Payload: { sessionId, proposalId, userId?, reason? }
     */
    socket.on('agent:reject', async (data) => {
      try {
        const { sessionId, proposalId, userId, reason } = data

        if (!proposalId) {
          socket.emit('agent:error', {
            sessionId,
            error: { message: 'Proposal ID is required' }
          })
          return
        }

        console.log(`[Agent] Reject request for session ${sessionId}, proposal ${proposalId}`)

        const result = await rejectProposalUseCase.execute({
          proposalId,
          sessionId,
          userId,
          reason
        })

        socket.emit('agent:rejected', {
          sessionId,
          proposalId,
          proposal: result.proposal,
          reason: result.reason
        })

      } catch (error) {
        console.error(`[Agent] Error rejecting proposal:`, error)
        socket.emit('agent:error', {
          sessionId: data?.sessionId,
          proposalId: data?.proposalId,
          error: { message: error.message }
        })
      }
    })

    /**
     * Rollback approved changes
     * Payload: { sessionId, proposalId, userId? }
     */
    socket.on('agent:rollback', async (data) => {
      try {
        const { sessionId, proposalId, userId } = data

        if (!proposalId) {
          socket.emit('agent:error', {
            sessionId,
            error: { message: 'Proposal ID is required' }
          })
          return
        }

        console.log(`[Agent] Rollback request for session ${sessionId}, proposal ${proposalId}`)

        const result = await rollbackProposalUseCase.execute({
          proposalId,
          sessionId,
          userId
        })

        socket.emit('agent:rollback:response', {
          sessionId,
          proposalId,
          proposal: result.proposal,
          result: result.result
        })

      } catch (error) {
        console.error(`[Agent] Error rolling back proposal:`, error)
        socket.emit('agent:error', {
          sessionId: data?.sessionId,
          proposalId: data?.proposalId,
          error: { message: error.message }
        })
      }
    })

    /**
     * Respond to a permission request
     * Payload: { requestId, allow: boolean, message?: string }
     */
    socket.on('agent:permission_response', async (data) => {
      try {
        const { requestId, allow, message } = data

        if (!requestId) {
          socket.emit('agent:error', {
            error: { message: 'Request ID is required' }
          })
          return
        }

        log(`Permission response for ${requestId}: ${allow ? 'ALLOW' : 'DENY'}`)

        const success = claudeAgentAdapter.respondToPermission({
          requestId,
          allow,
          message
        })

        if (success) {
          socket.emit('agent:permission_response:ack', {
            requestId,
            status: 'delivered'
          })
        } else {
          socket.emit('agent:error', {
            requestId,
            error: { message: 'Permission request not found or already expired' }
          })
        }

      } catch (error) {
        console.error(`[Agent] Error responding to permission:`, error)
        socket.emit('agent:error', {
          requestId: data?.requestId,
          error: { message: error.message }
        })
      }
    })

    /**
     * Get pending permission requests for a session
     * Payload: { sessionId? }
     */
    socket.on('agent:permissions:pending', (data) => {
      const { sessionId } = data || {}
      const pending = claudeAgentAdapter.getPendingPermissions(sessionId)
      socket.emit('agent:permissions:pending:response', { pending })
    })

    /**
     * Toggle debug/verbose logging for this socket
     * Payload: { enabled: boolean }
     */
    socket.on('agent:debug', (data) => {
      const { enabled } = data || {}

      if (enabled) {
        debugSockets.add(socket.id)
        log(`Debug mode ENABLED for socket ${socket.id}`)
      } else {
        debugSockets.delete(socket.id)
        log(`Debug mode DISABLED for socket ${socket.id}`)
      }

      socket.emit('agent:debug:response', { enabled: !!enabled, socketId: socket.id })
    })

    /**
     * Handle client disconnect - cleanup any active sessions
     */
    socket.on('disconnect', () => {
      log(`Client disconnected: ${socket.id}`)
      // Clean up debug tracking
      debugSockets.delete(socket.id)
      // Note: Sessions continue running after disconnect
      // They can be stopped via agent:stop or will timeout naturally
    })
  })

  return io
}

export default setupAgentHandlers
