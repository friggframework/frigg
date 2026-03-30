/**
 * SettingsRepository
 * Simple in-memory settings storage for the Management UI
 *
 * Used to cache connection settings and other UI preferences
 */

export class SettingsRepository {
  constructor() {
    this._settings = new Map()
  }

  /**
   * Get a setting value
   * @param {string} key - Setting key
   * @returns {Promise<any>} Setting value or null
   */
  async get(key) {
    return this._settings.get(key) || null
  }

  /**
   * Set a setting value
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   * @returns {Promise<void>}
   */
  async set(key, value) {
    this._settings.set(key, value)
  }

  /**
   * Delete a setting
   * @param {string} key - Setting key
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(key) {
    return this._settings.delete(key)
  }

  /**
   * Clear all settings
   * @returns {Promise<void>}
   */
  async clear() {
    this._settings.clear()
  }
}
