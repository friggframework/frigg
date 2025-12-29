/**
 * Utility functions for creating standardized API responses
 * Implements the API contract defined in api-contract.md
 */

/**
 * Create a standardized success response
 * @param {any} data - The response data
 * @param {string} message - Optional success message
 * @returns {object} Standardized success response
 */
export function createStandardResponse(data, message = null) {
  return {
    status: 'success',
    data,
    message,
    timestamp: new Date().toISOString()
  }
}

/**
 * Create a standardized error response
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {any} details - Optional error details
 * @returns {object} Standardized error response
 */
export function createErrorResponse(code, message, details = null) {
  return {
    status: 'error',
    error: {
      code,
      message,
      details
    },
    timestamp: new Date().toISOString()
  }
}

/**
 * Error codes for different types of errors
 */
export const ERROR_CODES = {
  // General errors
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  
  // Project errors
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  PROJECT_ALREADY_RUNNING: 'PROJECT_ALREADY_RUNNING',
  PROJECT_NOT_RUNNING: 'PROJECT_NOT_RUNNING',
  PROJECT_START_FAILED: 'PROJECT_START_FAILED',
  PROJECT_STOP_FAILED: 'PROJECT_STOP_FAILED',
  
  // Integration errors
  INTEGRATION_NOT_FOUND: 'INTEGRATION_NOT_FOUND',
  INTEGRATION_ALREADY_INSTALLED: 'INTEGRATION_ALREADY_INSTALLED',
  INTEGRATION_INSTALL_FAILED: 'INTEGRATION_INSTALL_FAILED',
  INTEGRATION_CONFIG_INVALID: 'INTEGRATION_CONFIG_INVALID',
  
  // Environment errors
  ENV_READ_FAILED: 'ENV_READ_FAILED',
  ENV_WRITE_FAILED: 'ENV_WRITE_FAILED',
  ENV_SYNC_FAILED: 'ENV_SYNC_FAILED',
  
  // CLI errors
  CLI_COMMAND_FAILED: 'CLI_COMMAND_FAILED',
  CLI_COMMAND_NOT_FOUND: 'CLI_COMMAND_NOT_FOUND'
}

/**
 * Wrap async route handlers to catch errors automatically
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped function with error handling
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}