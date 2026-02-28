/**
 * Response Helpers for Express Controllers
 * Provides consistent response formatting across all API endpoints
 *
 * DDD: Part of Presentation layer - handles HTTP-specific concerns
 */

/**
 * Send a successful response with data
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {number} statusCode - HTTP status code (default: 200)
 */
export function sendSuccess(res, data, statusCode = 200) {
  res.status(statusCode).json({
    success: true,
    data
  })
}

/**
 * Send a successful response for created resources
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 */
export function sendCreated(res, data) {
  sendSuccess(res, data, 201)
}

/**
 * Send a successful response with no content
 * @param {Object} res - Express response object
 */
export function sendNoContent(res) {
  res.status(204).send()
}

/**
 * Send an error response
 * @param {Object} res - Express response object
 * @param {string} error - Error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {Object} details - Additional error details
 */
export function sendError(res, error, statusCode = 500, details = null) {
  const response = {
    success: false,
    error
  }

  if (details) {
    response.details = details
  }

  res.status(statusCode).json(response)
}

/**
 * Send a bad request error (400)
 * @param {Object} res - Express response object
 * @param {string} error - Error message
 * @param {Object} details - Validation details
 */
export function sendBadRequest(res, error, details = null) {
  sendError(res, error, 400, details)
}

/**
 * Send a not found error (404)
 * @param {Object} res - Express response object
 * @param {string} resource - Resource type that wasn't found
 */
export function sendNotFound(res, resource = 'Resource') {
  sendError(res, `${resource} not found`, 404)
}

/**
 * Send a conflict error (409)
 * @param {Object} res - Express response object
 * @param {string} error - Error message
 * @param {Object} details - Conflict details
 */
export function sendConflict(res, error, details = null) {
  sendError(res, error, 409, details)
}

/**
 * Emit a WebSocket event if socket.io is available
 * @param {Object} req - Express request object
 * @param {string} event - Event name
 * @param {*} data - Event data
 */
export function emitSocketEvent(req, event, data) {
  const io = req.app.get('io')
  if (io) {
    io.emit(event, data)
  }
}

/**
 * Emit a WebSocket event to a specific room
 * @param {Object} req - Express request object
 * @param {string} room - Room name
 * @param {string} event - Event name
 * @param {*} data - Event data
 */
export function emitToRoom(req, room, event, data) {
  const io = req.app.get('io')
  if (io) {
    io.to(room).emit(event, data)
  }
}

/**
 * HTTP Status Codes as constants for clarity
 */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
}

export default {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendError,
  sendBadRequest,
  sendNotFound,
  sendConflict,
  emitSocketEvent,
  emitToRoom,
  HttpStatus
}
