/**
 * Proposal Entity
 * Represents a pending code change proposal from the AI agent
 *
 * Part of the approval workflow for AI-generated changes
 */

export class Proposal {
  /**
   * @param {Object} params
   * @param {string} params.id - Unique proposal ID
   * @param {string} params.sessionId - Associated agent session ID
   * @param {string} params.toolName - The tool that generated this proposal (Edit, Write, etc.)
   * @param {Object} params.toolArgs - Arguments passed to the tool
   * @param {string} params.status - pending | approved | rejected | rolled_back
   * @param {Date} params.createdAt - When the proposal was created
   * @param {Date} params.resolvedAt - When the proposal was approved/rejected
   * @param {string} params.resolvedBy - Who resolved the proposal (user ID or 'system')
   */
  constructor({
    id,
    sessionId,
    toolName,
    toolArgs,
    status = 'pending',
    createdAt = new Date(),
    resolvedAt = null,
    resolvedBy = null
  }) {
    this.id = id
    this.sessionId = sessionId
    this.toolName = toolName
    this.toolArgs = toolArgs
    this.status = status
    this.createdAt = createdAt
    this.resolvedAt = resolvedAt
    this.resolvedBy = resolvedBy

    this._validate()
  }

  _validate() {
    if (!this.id) {
      throw new Error('Proposal ID is required')
    }
    if (!this.sessionId) {
      throw new Error('Session ID is required')
    }
    if (!this.toolName) {
      throw new Error('Tool name is required')
    }
    if (!['pending', 'approved', 'rejected', 'rolled_back'].includes(this.status)) {
      throw new Error(`Invalid proposal status: ${this.status}`)
    }
  }

  /**
   * Check if this proposal can be approved
   */
  canApprove() {
    return this.status === 'pending'
  }

  /**
   * Check if this proposal can be rejected
   */
  canReject() {
    return this.status === 'pending'
  }

  /**
   * Check if this proposal can be rolled back
   */
  canRollback() {
    return this.status === 'approved'
  }

  /**
   * Mark proposal as approved
   * @param {string} resolvedBy - Who approved
   */
  approve(resolvedBy = 'user') {
    if (!this.canApprove()) {
      throw new Error(`Cannot approve proposal with status: ${this.status}`)
    }
    this.status = 'approved'
    this.resolvedAt = new Date()
    this.resolvedBy = resolvedBy
  }

  /**
   * Mark proposal as rejected
   * @param {string} resolvedBy - Who rejected
   */
  reject(resolvedBy = 'user') {
    if (!this.canReject()) {
      throw new Error(`Cannot reject proposal with status: ${this.status}`)
    }
    this.status = 'rejected'
    this.resolvedAt = new Date()
    this.resolvedBy = resolvedBy
  }

  /**
   * Mark proposal as rolled back
   * @param {string} resolvedBy - Who initiated rollback
   */
  rollback(resolvedBy = 'user') {
    if (!this.canRollback()) {
      throw new Error(`Cannot rollback proposal with status: ${this.status}`)
    }
    this.status = 'rolled_back'
    this.resolvedAt = new Date()
    this.resolvedBy = resolvedBy
  }

  /**
   * Get file path affected by this proposal
   */
  getFilePath() {
    return this.toolArgs?.file_path || this.toolArgs?.path || null
  }

  /**
   * Get the proposed content/changes
   */
  getProposedChanges() {
    switch (this.toolName) {
      case 'Write':
        return {
          type: 'create',
          filePath: this.toolArgs.file_path,
          content: this.toolArgs.content
        }
      case 'Edit':
        return {
          type: 'edit',
          filePath: this.toolArgs.file_path,
          oldString: this.toolArgs.old_string,
          newString: this.toolArgs.new_string,
          replaceAll: this.toolArgs.replace_all || false
        }
      default:
        return {
          type: 'unknown',
          toolName: this.toolName,
          args: this.toolArgs
        }
    }
  }

  toJSON() {
    return {
      id: this.id,
      sessionId: this.sessionId,
      toolName: this.toolName,
      toolArgs: this.toolArgs,
      status: this.status,
      createdAt: this.createdAt.toISOString(),
      resolvedAt: this.resolvedAt?.toISOString() || null,
      resolvedBy: this.resolvedBy,
      filePath: this.getFilePath(),
      changes: this.getProposedChanges()
    }
  }

  /**
   * Create a Proposal from a tool_call event
   * @param {Object} toolCallEvent - The tool_call event from the agent
   * @param {string} sessionId - The session ID
   */
  static fromToolCall(toolCallEvent, sessionId) {
    return new Proposal({
      id: toolCallEvent.toolUseId || `proposal-${Date.now()}`,
      sessionId,
      toolName: toolCallEvent.name,
      toolArgs: toolCallEvent.args
    })
  }
}

export default Proposal
