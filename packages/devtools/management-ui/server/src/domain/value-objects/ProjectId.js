import crypto from 'crypto'

/**
 * ProjectId Value Object
 * Generates deterministic IDs based on absolute file paths
 * Uses first 8 characters of SHA-256 hash
 */
export class ProjectId {
  /**
   * Generate a deterministic project ID from an absolute path
   * @param {string} absolutePath - The absolute file path
   * @returns {string} First 8 characters of SHA-256 hash
   */
  static generate(absolutePath) {
    if (!absolutePath || typeof absolutePath !== 'string') {
      throw new Error('ProjectId.generate requires a valid absolute path string')
    }

    const hash = crypto.createHash('sha256')
      .update(absolutePath)
      .digest('hex')

    return hash.substring(0, 8)
  }

  /**
   * Validate if a string is a valid project ID format
   * @param {string} id - The ID to validate
   * @returns {boolean}
   */
  static isValid(id) {
    return typeof id === 'string' && /^[a-f0-9]{8}$/.test(id)
  }
}