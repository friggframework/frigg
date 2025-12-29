/**
 * FriggAppConnection Value Object
 * Represents the connection state to a running Frigg app
 *
 * This value object tracks:
 * - Connection state (disconnected, connecting, connected, error)
 * - Configuration used to connect
 * - Health status of the connected app
 * - User management mode from the app definition
 * - The app definition itself
 */
export class FriggAppConnection {
  static STATES = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    ERROR: 'error'
  }

  /**
   * Create a disconnected connection state
   * @returns {FriggAppConnection}
   */
  static disconnected() {
    return new FriggAppConnection({
      state: FriggAppConnection.STATES.DISCONNECTED,
      config: null,
      healthStatus: null,
      userManagementMode: null,
      appDefinition: null,
      lastChecked: null,
      errorMessage: null
    })
  }

  /**
   * Create a connecting state
   * @param {AdminApiConfig} config - The configuration being used to connect
   * @returns {FriggAppConnection}
   */
  static connecting(config) {
    return new FriggAppConnection({
      state: FriggAppConnection.STATES.CONNECTING,
      config,
      healthStatus: null,
      userManagementMode: null,
      appDefinition: null,
      lastChecked: null,
      errorMessage: null
    })
  }

  /**
   * Create a connected state
   * @param {object} params
   * @param {AdminApiConfig} params.config - The configuration used to connect
   * @param {object} params.healthStatus - Health check result
   * @param {UserManagementMode} params.userManagementMode - User management mode from app
   * @param {object} params.appDefinition - App definition from the Frigg app
   * @returns {FriggAppConnection}
   */
  static connected({ config, healthStatus, userManagementMode, appDefinition }) {
    return new FriggAppConnection({
      state: FriggAppConnection.STATES.CONNECTED,
      config,
      healthStatus,
      userManagementMode,
      appDefinition,
      lastChecked: new Date(),
      errorMessage: null
    })
  }

  /**
   * Create an error state
   * @param {AdminApiConfig} config - The configuration that failed
   * @param {string} errorMessage - Error message
   * @returns {FriggAppConnection}
   */
  static error(config, errorMessage) {
    return new FriggAppConnection({
      state: FriggAppConnection.STATES.ERROR,
      config,
      healthStatus: null,
      userManagementMode: null,
      appDefinition: null,
      lastChecked: new Date(),
      errorMessage
    })
  }

  /**
   * @param {object} params
   * @param {string} params.state - Connection state
   * @param {AdminApiConfig|null} params.config - API configuration
   * @param {object|null} params.healthStatus - Health status from the app
   * @param {UserManagementMode|null} params.userManagementMode - User management mode
   * @param {object|null} params.appDefinition - App definition
   * @param {Date|null} params.lastChecked - Last health check time
   * @param {string|null} params.errorMessage - Error message if in error state
   */
  constructor({ state, config, healthStatus, userManagementMode, appDefinition, lastChecked, errorMessage }) {
    this._state = state
    this._config = config
    this._healthStatus = healthStatus
    this._userManagementMode = userManagementMode
    this._appDefinition = appDefinition
    this._lastChecked = lastChecked
    this._errorMessage = errorMessage
    Object.freeze(this)
  }

  /**
   * Get the current state
   * @returns {string}
   */
  getState() {
    return this._state
  }

  /**
   * Get the configuration
   * @returns {AdminApiConfig|null}
   */
  getConfig() {
    return this._config
  }

  /**
   * Get the health status
   * @returns {object|null}
   */
  getHealthStatus() {
    return this._healthStatus
  }

  /**
   * Get the user management mode
   * @returns {UserManagementMode|null}
   */
  getUserManagementMode() {
    return this._userManagementMode
  }

  /**
   * Get the app definition
   * @returns {object|null}
   */
  getAppDefinition() {
    return this._appDefinition
  }

  /**
   * Get the last checked timestamp
   * @returns {Date|null}
   */
  getLastChecked() {
    return this._lastChecked
  }

  /**
   * Get the error message
   * @returns {string|null}
   */
  getErrorMessage() {
    return this._errorMessage
  }

  /**
   * Get the base URL from config
   * @returns {string|null}
   */
  getBaseUrl() {
    return this._config?.getBaseUrl() || null
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    return this._state === FriggAppConnection.STATES.CONNECTED
  }

  /**
   * Check if the connection is healthy
   * @returns {boolean}
   */
  isHealthy() {
    if (!this.isConnected()) {
      return false
    }
    return this._healthStatus?.status === 'healthy'
  }

  /**
   * Create new connection with updated health status
   * @param {object} healthStatus - New health status
   * @returns {FriggAppConnection}
   */
  withUpdatedHealth(healthStatus) {
    return new FriggAppConnection({
      state: this._state,
      config: this._config,
      healthStatus,
      userManagementMode: this._userManagementMode,
      appDefinition: this._appDefinition,
      lastChecked: new Date(),
      errorMessage: this._errorMessage
    })
  }

  /**
   * Serialize to JSON
   * @returns {object}
   */
  toJSON() {
    return {
      state: this._state,
      baseUrl: this.getBaseUrl(),
      isConnected: this.isConnected(),
      isHealthy: this.isHealthy(),
      healthStatus: this._healthStatus,
      userManagementMode: this._userManagementMode?.toJSON() || null,
      appName: this._appDefinition?.name || null,
      lastChecked: this._lastChecked?.toISOString() || null,
      errorMessage: this._errorMessage
    }
  }
}
