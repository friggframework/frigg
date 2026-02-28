/**
 * WebSocket Handlers for Test Area CLI Prompt Communication
 *
 * Handles real-time communication between the Test Area UI and
 * ProcessManager for interactive pre-flight check prompts from the CLI.
 */

const log = (...args) => console.log('[TestArea]', ...args)

/**
 * Setup test area WebSocket event handlers for CLI prompt interaction
 * @param {Object} params
 * @param {Object} params.io - Socket.io server instance
 * @param {Object} params.processManager - ProcessManager instance for CLI communication
 */
export function setupTestAreaHandlers({ io, processManager }) {
  io.on('connection', (socket) => {
    log(`Client connected to test area: ${socket.id}`)

    /**
     * Respond to a CLI prompt
     * Payload: { requestId: string, response: boolean | string }
     */
    socket.on('frigg:prompt_response', (data) => {
      const { requestId, response } = data || {}

      if (!requestId) {
        socket.emit('frigg:error', {
          error: { message: 'Request ID is required' }
        })
        return
      }

      if (response === undefined || response === null) {
        socket.emit('frigg:error', {
          requestId,
          error: { message: 'Response is required' }
        })
        return
      }

      log(`Prompt response for ${requestId}: ${response}`)

      const success = processManager.respondToPrompt(requestId, response)

      if (success) {
        socket.emit('frigg:prompt_response:ack', {
          requestId,
          status: 'delivered'
        })
      } else {
        socket.emit('frigg:error', {
          requestId,
          error: { message: 'Prompt not found or already expired' }
        })
      }
    })

    /**
     * Get pending prompts from CLI
     * Returns all prompts waiting for user response
     */
    socket.on('frigg:prompts:pending', () => {
      const prompts = processManager.getPendingPrompts()
      socket.emit('frigg:prompts:pending:response', { prompts })
    })

    /**
     * Forward prompt requests from ProcessManager to this socket
     */
    const handlePromptRequest = (data) => {
      log(`Forwarding prompt request to client: ${data.requestId}`)
      socket.emit('frigg:prompt_request', data)
    }
    processManager.on('frigg:prompt_request', handlePromptRequest)

    /**
     * Forward prompt responses from ProcessManager to this socket
     * (for confirmation/logging in UI)
     */
    const handlePromptResponse = (data) => {
      socket.emit('frigg:prompt_response', data)
    }
    processManager.on('frigg:prompt_response', handlePromptResponse)

    /**
     * Handle client disconnect - clean up event listeners
     */
    socket.on('disconnect', () => {
      log(`Client disconnected from test area: ${socket.id}`)
      // Remove listeners to prevent memory leaks and duplicate handlers
      processManager.off('frigg:prompt_request', handlePromptRequest)
      processManager.off('frigg:prompt_response', handlePromptResponse)
    })
  })

  return io
}

export default setupTestAreaHandlers
