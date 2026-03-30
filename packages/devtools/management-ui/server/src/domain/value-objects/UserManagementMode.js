/**
 * UserManagementMode Value Object
 * Represents the active user management configuration from the Frigg app
 *
 * The Frigg framework supports three authentication modes:
 * - friggToken: Native bearer token via /user/login (username/password)
 * - sharedSecret: Backend-to-backend with x-frigg-api-key + x-frigg-appuserid headers
 * - adopterJwt: Custom JWT from the adopter's auth system
 */
export class UserManagementMode {
  static MODES = {
    FRIGG_TOKEN: 'friggToken',
    SHARED_SECRET: 'sharedSecret',
    ADOPTER_JWT: 'adopterJwt'
  }

  /**
   * Create a UserManagementMode from an appDefinition object
   * @param {object|null|undefined} appDefinition - The app definition from the Frigg app
   * @returns {UserManagementMode}
   */
  static fromAppDefinition(appDefinition) {
    const userConfig = appDefinition?.user || {}
    const authModes = userConfig.authModes || {}

    const enabledModes = []

    // Check each auth mode
    if (authModes.friggToken?.enabled !== false) {
      // Default friggToken to enabled if no authModes specified or not explicitly disabled
      if (Object.keys(authModes).length === 0 || authModes.friggToken?.enabled) {
        enabledModes.push(UserManagementMode.MODES.FRIGG_TOKEN)
      }
    }

    if (authModes.sharedSecret?.enabled) {
      enabledModes.push(UserManagementMode.MODES.SHARED_SECRET)
    }

    if (authModes.adopterJwt?.enabled) {
      enabledModes.push(UserManagementMode.MODES.ADOPTER_JWT)
    }

    // Default to friggToken if nothing was enabled
    if (enabledModes.length === 0) {
      enabledModes.push(UserManagementMode.MODES.FRIGG_TOKEN)
    }

    return new UserManagementMode({
      enabledModes,
      primaryUserType: userConfig.primary || 'individual',
      individualRequired: userConfig.individualUserRequired ?? false,
      organizationRequired: userConfig.organizationUserRequired ?? false,
      usePassword: userConfig.usePassword ?? false
    })
  }

  /**
   * @param {object} config
   * @param {string[]} config.enabledModes - Array of enabled mode names
   * @param {string} config.primaryUserType - 'individual' or 'organization'
   * @param {boolean} config.individualRequired - Whether individual user is required
   * @param {boolean} config.organizationRequired - Whether organization user is required
   * @param {boolean} config.usePassword - Whether password authentication is used
   */
  constructor({ enabledModes, primaryUserType, individualRequired, organizationRequired, usePassword }) {
    this._enabledModes = [...enabledModes]
    this._primaryUserType = primaryUserType
    this._individualRequired = individualRequired
    this._organizationRequired = organizationRequired
    this._usePassword = usePassword
    Object.freeze(this)
  }

  /**
   * Check if friggToken mode is enabled
   * @returns {boolean}
   */
  isFriggTokenEnabled() {
    return this._enabledModes.includes(UserManagementMode.MODES.FRIGG_TOKEN)
  }

  /**
   * Check if sharedSecret mode is enabled
   * @returns {boolean}
   */
  isSharedSecretEnabled() {
    return this._enabledModes.includes(UserManagementMode.MODES.SHARED_SECRET)
  }

  /**
   * Check if adopterJwt mode is enabled
   * @returns {boolean}
   */
  isAdopterJwtEnabled() {
    return this._enabledModes.includes(UserManagementMode.MODES.ADOPTER_JWT)
  }

  /**
   * Get the primary user type
   * @returns {string} 'individual' or 'organization'
   */
  getPrimaryUserType() {
    return this._primaryUserType
  }

  /**
   * Check if individual user is required
   * @returns {boolean}
   */
  isIndividualRequired() {
    return this._individualRequired
  }

  /**
   * Check if organization user is required
   * @returns {boolean}
   */
  isOrganizationRequired() {
    return this._organizationRequired
  }

  /**
   * Check if password is required for authentication
   * @returns {boolean}
   */
  isPasswordRequired() {
    return this._usePassword
  }

  /**
   * Get array of all enabled mode names
   * @returns {string[]}
   */
  getEnabledModes() {
    return [...this._enabledModes]
  }

  /**
   * Get the primary (first) enabled mode
   * @returns {string|null}
   */
  getPrimaryMode() {
    return this._enabledModes[0] || null
  }

  /**
   * Serialize to JSON
   * @returns {object}
   */
  toJSON() {
    return {
      enabledModes: this.getEnabledModes(),
      primaryUserType: this._primaryUserType,
      individualRequired: this._individualRequired,
      organizationRequired: this._organizationRequired,
      usePassword: this._usePassword,
      friggTokenEnabled: this.isFriggTokenEnabled(),
      sharedSecretEnabled: this.isSharedSecretEnabled(),
      adopterJwtEnabled: this.isAdopterJwtEnabled()
    }
  }

  /**
   * Check equality with another UserManagementMode
   * @param {UserManagementMode} other
   * @returns {boolean}
   */
  equals(other) {
    if (!(other instanceof UserManagementMode)) {
      return false
    }

    // Compare all properties
    const thisJson = this.toJSON()
    const otherJson = other.toJSON()

    return (
      JSON.stringify(thisJson.enabledModes.sort()) === JSON.stringify(otherJson.enabledModes.sort()) &&
      thisJson.primaryUserType === otherJson.primaryUserType &&
      thisJson.individualRequired === otherJson.individualRequired &&
      thisJson.organizationRequired === otherJson.organizationRequired &&
      thisJson.usePassword === otherJson.usePassword
    )
  }
}
