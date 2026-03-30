/**
 * WebSocket Handlers for Chat Session Persistence
 *
 * Handles saving, loading, listing, and deleting chat sessions.
 * Sessions are stored per-project in .frigg/chat-sessions/
 */

const log = (...args) => console.log('[ChatSession]', ...args)

/**
 * Setup chat session WebSocket event handlers
 * @param {Object} params
 * @param {Object} params.io - Socket.io server instance
 * @param {Function} params.getRepositoryForSession - Function to create repository for a project path
 * @param {Object} params.saveChatSessionUseCase - Use case for saving sessions
 * @param {Object} params.getChatSessionUseCase - Use case for getting sessions
 * @param {Object} params.listChatSessionsUseCase - Use case for listing sessions
 * @param {Object} params.deleteChatSessionUseCase - Use case for deleting sessions
 */
export function setupChatSessionHandlers({
  io,
  getRepositoryForSession,
  saveChatSessionUseCase,
  getChatSessionUseCase,
  listChatSessionsUseCase,
  deleteChatSessionUseCase
}) {
  io.on('connection', (socket) => {
    /**
     * Save a chat session
     * Payload: { projectPath, session: { id, messages, permissionActions?, metadata? } }
     */
    socket.on('chat:session:save', async (data) => {
      try {
        const { projectPath, session } = data

        if (!projectPath) {
          socket.emit('chat:session:error', {
            error: { message: 'Project path is required' }
          })
          return
        }

        if (!session?.id) {
          socket.emit('chat:session:error', {
            error: { message: 'Session with ID is required' }
          })
          return
        }

        log(`Saving session ${session.id} for project: ${projectPath}`)

        // Create repository for this project path
        const repository = getRepositoryForSession(projectPath)

        // Create use case instance with project-specific repository
        const useCase = saveChatSessionUseCase(repository)
        const savedSession = await useCase.execute(session)

        socket.emit('chat:session:saved', {
          sessionId: savedSession.id,
          updatedAt: savedSession.updatedAt
        })

      } catch (error) {
        console.error('[ChatSession] Error saving session:', error)
        socket.emit('chat:session:error', {
          sessionId: data?.session?.id,
          error: { message: error.message }
        })
      }
    })

    /**
     * Get a chat session by ID
     * Payload: { projectPath, sessionId }
     */
    socket.on('chat:session:get', async (data) => {
      try {
        const { projectPath, sessionId } = data

        if (!projectPath) {
          socket.emit('chat:session:error', {
            error: { message: 'Project path is required' }
          })
          return
        }

        if (!sessionId) {
          socket.emit('chat:session:error', {
            error: { message: 'Session ID is required' }
          })
          return
        }

        log(`Getting session ${sessionId} for project: ${projectPath}`)

        const repository = getRepositoryForSession(projectPath)
        const useCase = getChatSessionUseCase(repository)
        const session = await useCase.execute({ sessionId })

        socket.emit('chat:session:data', {
          sessionId,
          session // null if not found
        })

      } catch (error) {
        console.error('[ChatSession] Error getting session:', error)
        socket.emit('chat:session:error', {
          sessionId: data?.sessionId,
          error: { message: error.message }
        })
      }
    })

    /**
     * List all chat sessions
     * Payload: { projectPath, summaryOnly?: boolean }
     */
    socket.on('chat:session:list', async (data) => {
      try {
        const { projectPath, summaryOnly = true } = data

        if (!projectPath) {
          socket.emit('chat:session:error', {
            error: { message: 'Project path is required' }
          })
          return
        }

        log(`Listing sessions for project: ${projectPath}`)

        const repository = getRepositoryForSession(projectPath)
        const useCase = listChatSessionsUseCase(repository)
        const sessions = await useCase.execute({ summaryOnly })

        socket.emit('chat:session:list:response', {
          sessions
        })

      } catch (error) {
        console.error('[ChatSession] Error listing sessions:', error)
        socket.emit('chat:session:error', {
          error: { message: error.message }
        })
      }
    })

    /**
     * Delete a chat session
     * Payload: { projectPath, sessionId?, all?: boolean }
     */
    socket.on('chat:session:delete', async (data) => {
      try {
        const { projectPath, sessionId, all = false } = data

        if (!projectPath) {
          socket.emit('chat:session:error', {
            error: { message: 'Project path is required' }
          })
          return
        }

        if (!all && !sessionId) {
          socket.emit('chat:session:error', {
            error: { message: 'Session ID is required when not deleting all' }
          })
          return
        }

        log(`Deleting ${all ? 'all sessions' : `session ${sessionId}`} for project: ${projectPath}`)

        const repository = getRepositoryForSession(projectPath)
        const useCase = deleteChatSessionUseCase(repository)
        await useCase.execute({ sessionId, all })

        socket.emit('chat:session:deleted', {
          sessionId: all ? null : sessionId,
          all
        })

      } catch (error) {
        console.error('[ChatSession] Error deleting session:', error)
        socket.emit('chat:session:error', {
          sessionId: data?.sessionId,
          error: { message: error.message }
        })
      }
    })
  })

  return io
}

export default setupChatSessionHandlers
