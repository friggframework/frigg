import crypto from 'crypto'

/**
 * Validates if a repository path is valid
 * @param {string} path - Repository path to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export function validateRepositoryPath(path) {
  if (!path || typeof path !== 'string') {
    return false
  }
  
  // Must be absolute path and have reasonable length
  return path.startsWith('/') && path.length > 2
}

/**
 * Formats a repository name for display
 * @param {string} name - Raw repository name
 * @returns {string} - Formatted display name
 */
export function formatRepositoryName(name) {
  if (!name || typeof name !== 'string') {
    return ''
  }
  
  let formatted = name
  
  // Remove common prefixes and suffixes
  formatted = formatted
    .replace(/^frigg-(.+)-api$/, '$1-api') // frigg-slack-api -> slack-api
    .replace(/-backend$/, '')
    .replace(/^frontend-/, '')
  
  // Convert to title case
  formatted = formatted
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
  
  return formatted
}

/**
 * Parses raw repository info into standardized format
 * @param {object} rawRepo - Raw repository data
 * @returns {object} - Parsed repository info
 */
export function parseRepositoryInfo(rawRepo) {
  const {
    name = '',
    path = '',
    framework = null,
    hasBackend = false,
    detectionReasons = []
  } = rawRepo
  
  // Generate consistent ID based on path
  const id = crypto
    .createHash('sha256')
    .update(path)
    .digest('hex')
    .substring(0, 16)
  
  return {
    id,
    name,
    displayName: formatRepositoryName(name),
    path,
    framework,
    hasBackend,
    detectionReasons: Array.isArray(detectionReasons) ? detectionReasons : [],
    status: 'unknown'
  }
}

/**
 * Gets the current status of a repository
 * @param {object} repo - Repository info
 * @returns {Promise<string>} - Status: 'active', 'inactive', or 'error'
 */
export async function getRepositoryStatus(repo) {
  try {
    if (!validateRepositoryPath(repo?.path) || !repo?.name) {
      return 'error'
    }
    
    // In a real implementation, this would check:
    // - If development servers are running
    // - If the repository is accessible
    // - If there are any errors in logs
    
    // For now, return a mock status
    return 'inactive'
  } catch (error) {
    return 'error'
  }
}