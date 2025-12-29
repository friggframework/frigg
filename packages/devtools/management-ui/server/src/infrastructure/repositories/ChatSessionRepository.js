/**
 * Chat Session Repository
 *
 * File-based persistence for chat sessions in Frigg projects.
 * Sessions are stored in .frigg/chat-sessions/ within the target project,
 * gitignored by default, and recoverable across restarts.
 *
 * Following Hexagonal Architecture: This is an infrastructure adapter
 * that implements the persistence port for chat sessions.
 */

import fs from 'fs/promises'
import path from 'path'

/**
 * @typedef {Object} ChatMessage
 * @property {'user' | 'assistant'} role
 * @property {Array<{type: string, text?: string}>} content
 */

/**
 * @typedef {Object} PermissionAction
 * @property {string} id
 * @property {'approved' | 'denied'} type
 * @property {string} toolName
 * @property {string} [toolUseId]
 * @property {string} description
 * @property {string} [reason]
 * @property {number} timestamp
 */

/**
 * @typedef {Object} ChatSession
 * @property {string} id - Unique session identifier
 * @property {ChatMessage[]} messages - Conversation messages
 * @property {PermissionAction[]} [permissionActions] - User approval/denial actions
 * @property {Object} [metadata] - Additional session metadata (branch, repo, etc.)
 * @property {number} createdAt - Unix timestamp
 * @property {number} updatedAt - Unix timestamp
 */

/**
 * @typedef {Object} ChatSessionSummary
 * @property {string} id
 * @property {string} preview - First user message preview
 * @property {number} messageCount
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {Object} [metadata]
 */

export class ChatSessionRepository {
  /**
   * @param {Object} options
   * @param {string} options.projectPath - Path to the Frigg project
   * @param {string} [options.sessionDir='chat-sessions'] - Subdirectory name
   */
  constructor({ projectPath, sessionDir = 'chat-sessions' }) {
    this.projectPath = projectPath
    this.sessionDir = sessionDir
    this.basePath = path.join(projectPath, '.frigg', sessionDir)
  }

  /**
   * Ensure the session directory exists and is gitignored
   * @private
   */
  async _ensureDir() {
    await fs.mkdir(this.basePath, { recursive: true })

    // Ensure .frigg directory is gitignored
    const gitignorePath = path.join(this.projectPath, '.frigg', '.gitignore')
    try {
      await fs.access(gitignorePath)
    } catch {
      // Create .gitignore if it doesn't exist
      await fs.writeFile(gitignorePath, `# Frigg local data - not committed to git
*
!.gitignore
`, 'utf-8')
    }
  }

  /**
   * Get the file path for a session
   * @private
   * @param {string} sessionId
   * @returns {string}
   */
  _getFilePath(sessionId) {
    return path.join(this.basePath, `${sessionId}.json`)
  }

  /**
   * Save a chat session
   * Creates or updates the session file
   * @param {ChatSession} session
   * @returns {Promise<ChatSession>}
   */
  async save(session) {
    await this._ensureDir()

    const sessionToSave = {
      ...session,
      updatedAt: Date.now()
    }

    const filePath = this._getFilePath(session.id)
    await fs.writeFile(filePath, JSON.stringify(sessionToSave, null, 2), 'utf-8')

    return sessionToSave
  }

  /**
   * Find a session by ID
   * @param {string} sessionId
   * @returns {Promise<ChatSession | null>}
   */
  async findById(sessionId) {
    const filePath = this._getFilePath(sessionId)

    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null
      }
      // Log but don't throw for corrupted files
      console.error(`Error reading session ${sessionId}:`, error.message)
      return null
    }
  }

  /**
   * Find all sessions, sorted by updatedAt descending
   * @returns {Promise<ChatSession[]>}
   */
  async findAll() {
    try {
      await this._ensureDir()
      const files = await fs.readdir(this.basePath)
      const jsonFiles = files.filter(f => f.endsWith('.json'))

      const sessions = []
      for (const file of jsonFiles) {
        const sessionId = file.replace('.json', '')
        const session = await this.findById(sessionId)
        if (session) {
          sessions.push(session)
        }
      }

      // Sort by updatedAt descending (most recent first)
      return sessions.sort((a, b) => b.updatedAt - a.updatedAt)
    } catch (error) {
      if (error.code === 'ENOENT') {
        return []
      }
      throw error
    }
  }

  /**
   * Find all session summaries (for list view)
   * Returns lightweight objects without full message content
   * @returns {Promise<ChatSessionSummary[]>}
   */
  async findAllSummaries() {
    const sessions = await this.findAll()

    return sessions.map(session => {
      // Get preview from first user message
      const firstUserMessage = session.messages?.find(m => m.role === 'user')
      const firstTextContent = firstUserMessage?.content?.find(c => c.type === 'text')
      const preview = firstTextContent?.text?.slice(0, 100) || 'Empty conversation'

      return {
        id: session.id,
        preview,
        messageCount: session.messages?.length || 0,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        metadata: session.metadata
      }
    })
  }

  /**
   * Delete a session by ID
   * @param {string} sessionId
   * @returns {Promise<void>}
   */
  async delete(sessionId) {
    const filePath = this._getFilePath(sessionId)

    try {
      await fs.unlink(filePath)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
      // Silently ignore if file doesn't exist
    }
  }

  /**
   * Delete all sessions
   * @returns {Promise<void>}
   */
  async deleteAll() {
    try {
      const files = await fs.readdir(this.basePath)
      const jsonFiles = files.filter(f => f.endsWith('.json'))

      await Promise.all(
        jsonFiles.map(file => fs.unlink(path.join(this.basePath, file)))
      )
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
  }

  /**
   * Check if sessions directory exists
   * @returns {Promise<boolean>}
   */
  async exists() {
    try {
      await fs.access(this.basePath)
      return true
    } catch {
      return false
    }
  }
}

export default ChatSessionRepository
