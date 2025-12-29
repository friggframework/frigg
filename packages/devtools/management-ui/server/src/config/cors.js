/**
 * CORS Configuration
 * Reads allowed origins from environment variables with sensible defaults
 *
 * Environment variables:
 * - CORS_ORIGINS: Comma-separated list of allowed origins (default: localhost dev ports)
 * - CORS_CREDENTIALS: Whether to allow credentials (default: true)
 * - CORS_METHODS: Comma-separated list of allowed methods (default: GET,POST,PUT,DELETE,PATCH)
 */

/**
 * Default origins for development
 */
const DEFAULT_ORIGINS = [
  'http://localhost:5173', // Vite dev server
  'http://localhost:3000', // Alternative dev port
  'http://localhost:3001'  // Frigg backend
]

/**
 * Default HTTP methods allowed
 */
const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']

/**
 * Parse comma-separated string to array
 * @param {string} str - Comma-separated string
 * @param {string[]} defaultValue - Default array if string is empty
 * @returns {string[]} Parsed array
 */
function parseList(str, defaultValue) {
  if (!str || str.trim() === '') {
    return defaultValue
  }
  return str.split(',').map(item => item.trim()).filter(Boolean)
}

/**
 * Parse boolean from environment variable
 * @param {string} str - String value
 * @param {boolean} defaultValue - Default value
 * @returns {boolean} Parsed boolean
 */
function parseBoolean(str, defaultValue) {
  if (str === undefined || str === null || str === '') {
    return defaultValue
  }
  return str.toLowerCase() === 'true' || str === '1'
}

/**
 * Get CORS configuration from environment
 * @returns {Object} CORS configuration object
 */
export function getCorsConfig() {
  const origins = parseList(process.env.CORS_ORIGINS, DEFAULT_ORIGINS)
  const methods = parseList(process.env.CORS_METHODS, DEFAULT_METHODS)
  const credentials = parseBoolean(process.env.CORS_CREDENTIALS, true)

  return {
    origin: origins,
    methods,
    credentials
  }
}

/**
 * Get CORS configuration for Express middleware
 * @returns {Object} CORS middleware options
 */
export function getExpressCorsConfig() {
  const { origin, credentials } = getCorsConfig()
  return {
    origin,
    credentials
  }
}

/**
 * Get CORS configuration for Socket.io
 * @returns {Object} Socket.io CORS options
 */
export function getSocketIoCorsConfig() {
  return getCorsConfig()
}

/**
 * Check if origin is allowed
 * @param {string} origin - Origin to check
 * @returns {boolean} Whether origin is allowed
 */
export function isOriginAllowed(origin) {
  const { origin: allowedOrigins } = getCorsConfig()

  // If wildcard is in origins, allow all
  if (allowedOrigins.includes('*')) {
    return true
  }

  return allowedOrigins.includes(origin)
}

/**
 * Log CORS configuration (without sensitive data)
 */
export function logCorsConfig() {
  const config = getCorsConfig()
  console.log('CORS Configuration:')
  console.log(`  Origins: ${config.origin.join(', ')}`)
  console.log(`  Methods: ${config.methods.join(', ')}`)
  console.log(`  Credentials: ${config.credentials}`)
}

// Named exports for arrays need to be explicitly exported
export { DEFAULT_ORIGINS, DEFAULT_METHODS }

export default {
  getCorsConfig,
  getExpressCorsConfig,
  getSocketIoCorsConfig,
  isOriginAllowed,
  logCorsConfig,
  DEFAULT_ORIGINS,
  DEFAULT_METHODS
}
