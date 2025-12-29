/**
 * GetUserManagementModeUseCase
 * Application Layer - Use case for detecting which user management mode is active
 *
 * This use case:
 * - Retrieves the user management configuration from the connected Frigg app
 * - Provides information about enabled authentication modes
 * - Helps the UI determine which authentication UI to show
 */

import { UserManagementMode } from '../../../domain/value-objects/UserManagementMode.js'

export class GetUserManagementModeUseCase {
  /**
   * @param {object} params
   * @param {FriggAppHttpAdapter} params.friggAppAdapter - Adapter for Frigg app communication
   */
  constructor({ friggAppAdapter }) {
    this._friggAppAdapter = friggAppAdapter
  }

  /**
   * Execute the use case to get user management mode
   * @returns {Promise<object>} Result with user management mode details
   */
  async execute() {
    if (!this._friggAppAdapter.isConnected()) {
      return {
        success: false,
        error: 'Not connected to Frigg app. Connect first to detect user management mode.'
      }
    }

    const connection = this._friggAppAdapter.getConnection()
    const userManagementMode = connection.getUserManagementMode()

    if (!userManagementMode) {
      return {
        success: false,
        error: 'User management mode not available'
      }
    }

    return {
      success: true,
      mode: userManagementMode.toJSON()
    }
  }

  /**
   * Get list of available authentication methods with descriptions
   * @returns {Array<object>} List of auth methods with enabled status
   */
  getAvailableAuthMethods() {
    if (!this._friggAppAdapter.isConnected()) {
      return []
    }

    const connection = this._friggAppAdapter.getConnection()
    const mode = connection.getUserManagementMode()

    if (!mode) {
      return []
    }

    return [
      {
        id: UserManagementMode.MODES.FRIGG_TOKEN,
        label: 'Username/Password',
        description: 'Authenticate with email and password via /user/login',
        enabled: mode.isFriggTokenEnabled()
      },
      {
        id: UserManagementMode.MODES.SHARED_SECRET,
        label: 'API Headers',
        description: 'Authenticate using x-frigg-appuserid and x-frigg-apporgid headers',
        enabled: mode.isSharedSecretEnabled()
      },
      {
        id: UserManagementMode.MODES.ADOPTER_JWT,
        label: 'JWT Token',
        description: 'Authenticate using adopter-provided JWT token',
        enabled: mode.isAdopterJwtEnabled()
      }
    ]
  }
}
