/**
 * Claude Agent Adapter
 * Wraps the @anthropic-ai/claude-agent-sdk for programmatic access
 * Supports Claude MAX subscription via Claude Code
 */

import { query } from '@anthropic-ai/claude-agent-sdk'
import {
  buildFriggSystemPrompt,
  AGENT_ROLES,
  ADVERSARIAL_AGENTS
} from '../../domain/ai/prompts/index.js'

// Verbose logging - enable with DEBUG=true, DEBUG_AGENT=true, or VERBOSE=true
const VERBOSE = process.env.DEBUG === 'true' ||
  process.env.DEBUG_AGENT === 'true' ||
  process.env.VERBOSE === 'true'

const log = (...args) => console.log('[ClaudeAgent]', ...args)
const verbose = (...args) => {
  if (VERBOSE) console.log('[ClaudeAgent:Verbose]', ...args)
}

export class ClaudeAgentAdapter {
  constructor({ projectPath = process.cwd() } = {}) {
    this.projectPath = projectPath
    this.activeSessions = new Map()
    // Pending permission requests awaiting user response
    this.pendingPermissions = new Map()
  }

  /**
   * Start a new agent session
   * @param {Object} params
   * @param {string} params.sessionId - Unique session identifier
   * @param {string} params.prompt - The user's prompt
   * @param {string} params.projectPath - Path to run the agent in (overrides default)
   * @param {Object} params.config - Agent configuration
   * @param {string} params.config.model - Model to use
   * @param {string} params.config.role - Agent role (coder, reviewer, architect, etc.)
   * @param {boolean} params.config.requireApproval - Whether to require approval for edits
   * @param {number} params.config.maxTurns - Maximum number of turns
   * @param {Function} params.onEvent - Callback for streaming events
   * @param {Function} params.onPermissionRequest - Callback when tool approval is needed
   */
  async startSession({ sessionId, prompt, projectPath, config = {}, onEvent, onPermissionRequest }) {
    // Abort any existing session with this ID
    if (this.activeSessions.has(sessionId)) {
      await this.stopSession(sessionId)
    }

    const abortController = new AbortController()

    this.activeSessions.set(sessionId, {
      abortController,
      startedAt: Date.now(),
      status: 'running',
      role: config.role || 'coder'
    })

    try {
      // Build system prompt from registry
      const systemPrompt = this._buildSystemPrompt(config)

      // Create canUseTool handler for permission requests
      const canUseTool = async (toolName, input, { signal }) => {
        // If no permission request handler, auto-deny
        if (!onPermissionRequest) {
          log(`No permission handler, denying tool: ${toolName}`)
          return {
            behavior: 'deny',
            message: 'No permission handler configured'
          }
        }

        // Generate unique request ID
        const requestId = `perm-${sessionId}-${Date.now()}`

        verbose(`Permission request ${requestId} for tool: ${toolName}`)

        // Create promise that will be resolved when user responds
        const permissionPromise = new Promise((resolve, reject) => {
          // Store resolver so it can be called from respondToPermission()
          this.pendingPermissions.set(requestId, {
            resolve,
            reject,
            sessionId,
            toolName,
            input,
            createdAt: Date.now()
          })

          // Handle abort
          signal?.addEventListener('abort', () => {
            this.pendingPermissions.delete(requestId)
            reject(new Error('Permission request aborted'))
          })
        })

        // Emit permission request to frontend
        await onPermissionRequest({
          type: 'permission_request',
          requestId,
          sessionId,
          toolName,
          input,
          description: this._getToolDescription(toolName, input)
        })

        // Wait for user response (or timeout)
        try {
          const response = await Promise.race([
            permissionPromise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Permission request timed out')), 300000) // 5 min timeout
            )
          ])

          this.pendingPermissions.delete(requestId)
          return response
        } catch (error) {
          this.pendingPermissions.delete(requestId)
          return {
            behavior: 'deny',
            message: error.message || 'Permission request failed'
          }
        }
      }

      // Configure options for the Claude Agent SDK
      // Use provided projectPath, or fall back to default
      const effectivePath = projectPath || this.projectPath
      log(`Running agent in: ${effectivePath}`)

      const options = {
        cwd: effectivePath,
        model: config.model || 'claude-sonnet-4-20250514',
        permissionMode: config.requireApproval ? 'default' : 'acceptEdits',
        abortController,
        maxTurns: config.maxTurns || 50,
        systemPrompt,
        // Add canUseTool callback for permission handling
        canUseTool: config.requireApproval ? canUseTool : undefined
      }

      log(`Starting query for session ${sessionId}`)
      verbose('Query options:', {
        cwd: options.cwd,
        model: options.model,
        permissionMode: options.permissionMode,
        maxTurns: options.maxTurns,
        systemPromptLength: systemPrompt?.length
      })
      verbose('Prompt:', prompt)

      // Create the query - returns an AsyncGenerator
      const queryGenerator = query({
        prompt,
        options
      })

      // Process the stream
      let messageCount = 0
      for await (const message of queryGenerator) {
        messageCount++

        // Check if session was stopped
        if (!this.activeSessions.has(sessionId)) {
          verbose('Session stopped, breaking out of loop')
          break
        }

        verbose(`Message ${messageCount}:`, message.type, message)

        const event = this._transformSDKMessage(message)
        if (event && onEvent) {
          verbose('Emitting event:', event.type, event.content?.substring?.(0, 100) || event)
          await onEvent({ ...event, sessionId })
        }
      }

      log(`Session ${sessionId} completed with ${messageCount} messages`)

      // Session completed successfully
      if (this.activeSessions.has(sessionId)) {
        this.activeSessions.get(sessionId).status = 'completed'
        if (onEvent) {
          await onEvent({ type: 'done', sessionId })
        }
      }

    } catch (error) {
      const sessionInfo = this.activeSessions.get(sessionId)
      if (sessionInfo) {
        sessionInfo.status = 'error'
      }

      if (onEvent) {
        await onEvent({
          type: 'error',
          sessionId,
          error: {
            message: error.message,
            code: error.code || 'AGENT_ERROR'
          }
        })
      }

      throw error
    } finally {
      // Clean up session after a delay (for potential resume)
      setTimeout(() => {
        if (this.activeSessions.get(sessionId)?.status !== 'running') {
          this.activeSessions.delete(sessionId)
        }
      }, 60000) // Keep for 1 minute after completion
    }
  }

  /**
   * Stop an active session
   * @param {string} sessionId
   */
  async stopSession(sessionId) {
    const session = this.activeSessions.get(sessionId)
    if (session) {
      session.status = 'stopped'
      session.abortController.abort()
      this.activeSessions.delete(sessionId)
      return true
    }
    return false
  }

  /**
   * Get session status
   * @param {string} sessionId
   */
  getSessionStatus(sessionId) {
    const session = this.activeSessions.get(sessionId)
    if (!session) {
      return null
    }
    return {
      sessionId,
      status: session.status,
      role: session.role,
      startedAt: session.startedAt,
      duration: Date.now() - session.startedAt
    }
  }

  /**
   * Get list of available roles
   */
  getAvailableRoles() {
    return {
      standard: Object.keys(AGENT_ROLES),
      adversarial: Object.keys(ADVERSARIAL_AGENTS)
    }
  }

  /**
   * Check if Claude Code / agent SDK is available
   *
   * Note: There's no official health check endpoint from Anthropic.
   * For claude-code, we verify the CLI is installed. Authentication
   * errors will surface when making actual requests.
   *
   * @param {string} provider - The provider to check (default: claude-code)
   * @returns {Promise<{available: boolean, error?: string, version?: string}>}
   */
  async checkAvailability(provider = 'claude-code') {
    if (provider !== 'claude-code') {
      // For API providers, availability depends on API key being set
      // Actual validation happens at request time
      return { available: true }
    }

    try {
      const { execSync } = await import('child_process')

      // Check if Claude CLI is installed by getting version
      const version = execSync('claude --version', {
        timeout: 5000,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      }).trim()

      // CLI is installed and responds
      return {
        available: true,
        version
      }
    } catch (error) {
      if (error.code === 'ENOENT' || error.message?.includes('ENOENT')) {
        return {
          available: false,
          error: 'Claude Code CLI not installed. Run: npm install -g @anthropic-ai/claude-code'
        }
      }

      // Other errors (timeout, permission, etc.)
      return {
        available: false,
        error: error.message || 'Claude Code CLI unavailable'
      }
    }
  }

  /**
   * Build system prompt from registry based on config
   * @param {Object} config
   */
  _buildSystemPrompt(config) {
    const { role, includeModules = true, includeCLI = true, includeArchitecture = true, includeTDD = true } = config

    // Get base Frigg context
    let prompt = buildFriggSystemPrompt({
      includeModules,
      includeCLI,
      includeArchitecture,
      includeTDD,
      projectPath: this.projectPath
    })

    // Add role-specific prompt if specified
    if (role) {
      const rolePrompt = AGENT_ROLES[role] || ADVERSARIAL_AGENTS[role]
      if (rolePrompt) {
        prompt = `${rolePrompt}\n\n${prompt}`
      }
    }

    return prompt
  }

  /**
   * Transform SDK message to our event format
   * @param {Object} message - SDK message
   */
  _transformSDKMessage(message) {
    // The SDK emits different message types
    // Transform them to our event format

    switch (message.type) {
      case 'user':
        // User message echo - we already have this
        return null

      case 'assistant':
        // Assistant response content
        if (message.message?.content) {
          const content = message.message.content
          // Handle text content blocks
          if (Array.isArray(content)) {
            const textContent = content
              .filter(block => block.type === 'text')
              .map(block => block.text)
              .join('\n\n') // Join multiple text blocks with double newline for paragraph separation
            if (textContent) {
              return { type: 'content', content: textContent }
            }
          } else if (typeof content === 'string') {
            return { type: 'content', content }
          }
        }
        return null

      case 'tool_use':
        // Tool being called
        return {
          type: 'tool_call',
          name: message.name,
          args: message.input,
          toolUseId: message.id
        }

      case 'tool_result':
        // Tool result
        return {
          type: 'tool_result',
          name: message.name || message.tool_use_id,
          result: message.content || message.output,
          isError: message.is_error
        }

      case 'result':
        // Final result
        return { type: 'result', data: message.data }

      case 'error':
        return {
          type: 'error',
          error: { message: message.error?.message || 'Unknown error' }
        }

      default:
        // Log unknown message types for debugging
        if (process.env.DEBUG) {
          console.log('Unknown SDK message type:', message.type, message)
        }
        return null
    }
  }

  /**
   * Respond to a pending permission request
   * @param {Object} params
   * @param {string} params.requestId - The permission request ID
   * @param {boolean} params.allow - Whether to allow the tool use
   * @param {string} params.message - Optional message (for denials)
   * @param {Object} params.updatedInput - Optional modified input (for allows)
   * @returns {boolean} Whether the response was successfully delivered
   */
  respondToPermission({ requestId, allow, message, updatedInput }) {
    const pending = this.pendingPermissions.get(requestId)
    if (!pending) {
      log(`No pending permission request found for ${requestId}`)
      return false
    }

    verbose(`Responding to permission ${requestId}: ${allow ? 'ALLOW' : 'DENY'}`)

    if (allow) {
      pending.resolve({
        behavior: 'allow',
        updatedInput: updatedInput || pending.input
      })
    } else {
      pending.resolve({
        behavior: 'deny',
        message: message || 'User denied permission'
      })
    }

    this.pendingPermissions.delete(requestId)
    return true
  }

  /**
   * Get pending permission requests for a session
   * @param {string} sessionId
   */
  getPendingPermissions(sessionId) {
    const pending = []
    for (const [requestId, request] of this.pendingPermissions) {
      if (!sessionId || request.sessionId === sessionId) {
        pending.push({
          requestId,
          sessionId: request.sessionId,
          toolName: request.toolName,
          input: request.input,
          createdAt: request.createdAt,
          description: this._getToolDescription(request.toolName, request.input)
        })
      }
    }
    return pending
  }

  /**
   * Generate human-readable description for a tool use
   * @param {string} toolName
   * @param {Object} input
   */
  _getToolDescription(toolName, input) {
    if (!input) return `Use ${toolName}`

    switch (toolName) {
      case 'Read':
        return `Read file: ${input.file_path || input.path || 'unknown'}`

      case 'Write':
        const writeSize = input.content?.length || 0
        return `Write ${writeSize} chars to: ${input.file_path || 'unknown'}`

      case 'Edit':
        return `Edit file: ${input.file_path || 'unknown'}`

      case 'Bash':
        const cmd = input.command?.trim() || ''
        const shortCmd = cmd.length > 60 ? cmd.slice(0, 60) + '...' : cmd
        return `Run command: ${shortCmd}`

      case 'Glob':
        return `Find files: ${input.pattern || 'unknown'}`

      case 'Grep':
        return `Search for: ${input.pattern || 'unknown'}`

      case 'Task':
        return `Spawn ${input.subagent_type || 'agent'}: ${input.description || 'task'}`

      case 'WebFetch':
        return `Fetch URL: ${input.url || 'unknown'}`

      case 'WebSearch':
        return `Search web: ${input.query || 'unknown'}`

      default:
        // Generic description with first key-value
        const firstKey = Object.keys(input)[0]
        if (firstKey) {
          const val = input[firstKey]
          const shortVal = typeof val === 'string' && val.length > 40
            ? val.slice(0, 40) + '...'
            : val
          return `${toolName}: ${firstKey}=${shortVal}`
        }
        return `Use ${toolName}`
    }
  }

  /**
   * Cleanup all sessions
   */
  async cleanup() {
    for (const [sessionId] of this.activeSessions) {
      await this.stopSession(sessionId)
    }
    // Also reject any pending permissions
    for (const [requestId, pending] of this.pendingPermissions) {
      pending.reject(new Error('Session cleanup'))
    }
    this.pendingPermissions.clear()
  }
}

export default ClaudeAgentAdapter
