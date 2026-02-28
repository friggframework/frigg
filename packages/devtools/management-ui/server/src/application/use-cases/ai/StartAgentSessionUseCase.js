/**
 * Start Agent Session Use Case
 * Handles starting an AI agent session for code generation
 */

export class StartAgentSessionUseCase {
  constructor({ claudeAgentAdapter, webSocketService }) {
    this.claudeAgentAdapter = claudeAgentAdapter
    this.webSocketService = webSocketService
  }

  /**
   * Execute the use case
   * @param {Object} params
   * @param {string} params.sessionId - Unique session identifier
   * @param {string} params.prompt - User's prompt
   * @param {string} params.projectPath - Path to run the agent in
   * @param {Object} params.config - Agent configuration
   * @param {string} params.socketId - Socket ID to emit events to
   */
  async execute({ sessionId, prompt, projectPath, config, socketId }) {
    if (!sessionId) {
      throw new Error('Session ID is required')
    }

    if (!prompt) {
      throw new Error('Prompt is required')
    }

    // Validate provider is claude-code
    if (config?.provider && config.provider !== 'claude-code') {
      throw new Error('Only claude-code provider is supported for agent sessions')
    }

    // Create event emitter callback
    const onEvent = async (event) => {
      if (this.webSocketService && socketId) {
        this.webSocketService.to(socketId).emit('agent:event', event)
      }
    }

    // Create permission request callback
    const onPermissionRequest = async (permissionEvent) => {
      if (this.webSocketService && socketId) {
        this.webSocketService.to(socketId).emit('agent:permission_request', permissionEvent)
      }
    }

    // Start the session (runs asynchronously)
    // Don't await - let it run in background
    this.claudeAgentAdapter.startSession({
      sessionId,
      prompt,
      projectPath,
      config: {
        model: config?.model,
        requireApproval: config?.requireApproval ?? true,
        maxTurns: config?.maxTurns
      },
      onEvent,
      onPermissionRequest
    }).catch(error => {
      console.error('Agent session error:', error)
      // Error already sent via onEvent
    })

    return {
      sessionId,
      status: 'started',
      message: 'Agent session started'
    }
  }
}

export default StartAgentSessionUseCase
