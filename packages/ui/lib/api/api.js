export default class API {
  constructor(baseUrl, jwt) {
    this.baseURL = baseUrl;
    this.jwt = jwt;

    this.endpointLogin = "/user/login";
    this.endpointCreateUser = "/user/create";

    this.endpointIntegration = (id) => `/api/integrations/${id}`;
    this.endpointIntegrationConfigOptions = (id) =>
      `${this.endpointIntegration(id)}/config/options`;
    this.endpointIntegrations = "/api/integrations";
    this.endpointSampleData = (id) => `/api/demo/sample/${id}`;
    this.endpointIntegrationUserActions = (id) =>
      `/api/integrations/${id}/actions`;
    this.endpointIntegrationUserActionOptions = (id, action) =>
      `/api/integrations/${id}/actions/${action}/options`;
    this.endpointIntegrationUserActionSubmit = (id, action) =>
      `/api/integrations/${id}/actions/${action}`;
  }

  async login(username, password) {
    const params = {
      username,
      password,
    };
    return this._post(this.endpointLogin, params);
  }

  async createUser(username, password) {
    const params = {
      username,
      password,
    };
    return this._post(this.endpointCreateUser, params);
  }

  // injects the access token into an object and returns the headers for most api calls
  getHeaders() {
    const headers = {
      "Content-Type": "application/json",
    };

    if (this.jwt) {
      headers.authorization = `Bearer ${this.jwt}`;
    }

    return headers;
  }

  // check the response of a fetch() before returning the data in JSON form.
  // may throw an exception if the response.status corresponds to an error
  async _checkResponse(response, url) {
    if (response.status >= 400) {
      console.error(
        `Error: http [${response.status}] ${url}: ${JSON.stringify(response)}`
      );
    }

    try {
      if (response.headers.get("x-lh-set"))
        localStorage.setItem("x-lh-set", response.headers.get("x-lh-set"));
      if (response.status === 204) return; // Early return since no content for 204

      return response.json();
    } catch (exception) {
      if (response.error === null || response.error === undefined) {
        return { error: null };
      }
      return { error: JSON.stringify(response) };
    }
  }

  // method to route all GET requests thru this function
  // to do error checking and return the JSON data
  async _get(endpoint) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = this.getHeaders();
    const response = await fetch(url, {
      method: "GET",
      headers,
    });
    return this._checkResponse(response, url);
  }

  // method to route all POST requests thru this function
  // to do error checking and return the JSON data
  async _post(endpoint, data) {
    const url = `${this.baseURL}${endpoint}`;
    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this._checkResponse(response, url);
  }

  // method to route all PATCH requests thru this function
  async _patch(endpoint, data) {
    const url = `${this.baseURL}${endpoint}`;
    const response = await fetch(url, {
      method: "PATCH",
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this._checkResponse(response, url);
  }

  // method to route all DELETE requests thru
  async _delete(endpoint, data) {
    const url = `${this.baseURL}${endpoint}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this._checkResponse(response, url);
  }

  // =========================================================================
  // MODULE ENDPOINTS
  // =========================================================================

  /**
   * Get available modules
   * @returns {Promise<{modules: Array}>}
   */
  async listModules() {
    return this._get('/api/modules');
  }

  /**
   * Get authorization requirements for module
   * @param {string} moduleType - Module type (e.g., 'slack', 'hubspot')
   * @param {number} step - Step number for multi-step auth (default: 1)
   * @param {string|null} sessionId - Session ID for steps > 1
   * @param {Object|null} redirectContext - Context for OAuth2 redirects
   * @param {string} [redirectContext.source] - Source UI ('management-ui' | 'frigg-ui-library')
   * @param {string} [redirectContext.returnUrl] - URL to return to after auth
   * @returns {Promise<Object>}
   */
  async getModuleAuthorizationRequirements(moduleType, step = 1, sessionId = null, redirectContext = null) {
    const params = new URLSearchParams({ step: step.toString() });

    if (sessionId) {
      params.append('sessionId', sessionId);
    }

    // Add redirect context for OAuth session tracking
    if (redirectContext) {
      if (redirectContext.source) {
        params.append('source', redirectContext.source);
      }
      if (redirectContext.returnUrl) {
        params.append('returnUrl', redirectContext.returnUrl);
      }
      if (redirectContext.frontendBaseUrl) {
        params.append('frontendBaseUrl', redirectContext.frontendBaseUrl);
      }
    } else {
      // Default context for frigg-ui-library
      params.append('source', 'frigg-ui-library');
      params.append('returnUrl', window.location.pathname || '/');
      // Always include frontend base URL so backend knows where to redirect after OAuth
      params.append('frontendBaseUrl', window.location.origin);
    }

    return this._get(`/api/modules/${moduleType}/authorization?${params.toString()}`);
  }

  /**
   * Submit authorization step
   * @param {string} moduleType - Module type
   * @param {object} data - Authorization data
   * @param {number} step - Step number (optional for single-step)
   * @param {string} sessionId - Session ID (required for multi-step)
   * @param {string} credentialId - Credential ID (for steps > 1)
   * @returns {Promise<Object>}
   */
  async submitModuleAuthorization(moduleType, data, step = null, sessionId = null, credentialId = null) {
    const params = { data };
    if (step) params.step = step;
    if (sessionId) params.sessionId = sessionId;
    if (credentialId) params.credentialId = credentialId;

    return this._post(`/api/modules/${moduleType}/authorization`, params);
  }

  // =========================================================================
  // CREDENTIAL ENDPOINTS
  // =========================================================================

  /**
   * List user's credentials
   * @param {object} filters - Optional filters
   * @param {string} filters.status - Filter by status (orphaned, active, invalid)
   * @param {string} filters.moduleType - Filter by module type
   * @returns {Promise<{credentials: Array}>}
   */
  async listCredentials(filters = {}) {
    let url = '/api/credentials';
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.moduleType) params.append('moduleType', filters.moduleType);

    if (params.toString()) url += '?' + params.toString();
    return this._get(url);
  }

  /**
   * Get credential details
   * @param {string} credentialId - Credential ID
   * @returns {Promise<Object>}
   */
  async getCredential(credentialId) {
    return this._get(`/api/credentials/${credentialId}`);
  }

  /**
   * Delete credential
   * @param {string} credentialId - Credential ID
   * @param {boolean} cascade - Also delete dependent entities
   * @returns {Promise<Object>}
   */
  async deleteCredential(credentialId, cascade = false) {
    const url = `/api/credentials/${credentialId}${cascade ? '?cascade=true' : ''}`;
    return this._delete(url, {});
  }

  /**
   * Test credential validity
   * @param {string} credentialId - Credential ID
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  async testCredential(credentialId) {
    return this._get(`/api/credentials/${credentialId}/test`);
  }

  /**
   * Resume authorization from credential
   * @param {string} credentialId - Credential ID
   * @returns {Promise<Object>}
   */
  async resumeFromCredential(credentialId) {
    return this._post(`/api/credentials/${credentialId}/resume`, {});
  }

  /**
   * Get options using credential
   * @param {string} credentialId - Credential ID
   * @returns {Promise<Object>}
   */
  async getCredentialOptions(credentialId) {
    return this._get(`/api/credentials/${credentialId}/options`);
  }

  // =========================================================================
  // ENTITY ENDPOINTS
  // =========================================================================

  /**
   * Get user's authorized entities/connected accounts
   * @param {object} filters - Optional filters
   * @param {string} filters.moduleType - Filter by module type
   * @returns {Promise<{entities: Array}>}
   */
  async listEntities(filters = {}) {
    let url = '/api/entities';
    if (filters.moduleType) {
      url += `?moduleType=${filters.moduleType}`;
    }
    return this._get(url);
  }

  /**
   * Get specific entity
   * @param {string} entityId - Entity ID
   * @returns {Promise<Object>}
   */
  async getEntity(entityId) {
    return this._get(`/api/entities/${entityId}`);
  }

  /**
   * Delete entity
   * @param {string} entityId - Entity ID
   * @param {boolean} deleteCredential - Also delete credential if unused
   * @returns {Promise<Object>}
   */
  async deleteEntity(entityId, deleteCredential = false) {
    const url = `/api/entities/${entityId}${deleteCredential ? '?deleteCredential=true' : ''}`;
    return this._delete(url, {});
  }

  /**
   * Test entity connection
   * @param {string} entityId - Entity ID
   * @returns {Promise<{valid: boolean, error?: string, canReauthorize?: boolean}>}
   */
  async testEntity(entityId) {
    return this._get(`/api/entities/${entityId}/test`);
  }

  /**
   * Initiate entity re-authentication
   * @param {string} entityId - Entity ID
   * @returns {Promise<{sessionId: string, requirements: Object}>}
   */
  async initiateEntityReauthorization(entityId) {
    return this._post(`/api/entities/${entityId}/reauthorize`, {});
  }

  /**
   * Complete re-authentication
   * @param {string} entityId - Entity ID
   * @param {object} data - Authorization data
   * @returns {Promise<Object>}
   */
  async completeEntityReauthorization(entityId, data) {
    return this._post(`/api/entities/${entityId}/reauthorize/complete`, data);
  }

  /**
   * Get entity options
   * @param {string} entityId - Entity ID
   * @param {string|null} optionType - Optional type filter
   * @returns {Promise<Object>}
   */
  async getEntityOptions(entityId, optionType = null) {
    const data = optionType ? { optionType } : {};
    return this._post(`/api/entities/${entityId}/options`, data);
  }

  /**
   * Refresh entity options
   * @param {string} entityId - Entity ID
   * @param {string|null} optionType - Optional type filter
   * @returns {Promise<Object>}
   */
  async refreshEntityOptions(entityId, optionType = null) {
    const data = optionType ? { optionType } : {};
    return this._post(`/api/entities/${entityId}/options/refresh`, data);
  }

  // =========================================================================
  // INTEGRATION ENDPOINTS
  // =========================================================================

  /**
   * Get user's installed integrations
   * @returns {Promise<{integrations: Array}>}
   */
  async listIntegrations() {
    return this._get(this.endpointIntegrations);
  }

  /**
   * Get available integration types/options configured in the Frigg instance
   * @returns {Promise<{integrations: Array}>}
   */
  async listIntegrationOptions() {
    return this._get(`${this.endpointIntegrations}/options`);
  }

  /**
   * Test integration
   * @param {string} integrationId - Integration ID
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  async testIntegration(integrationId) {
    return this._get(`${this.endpointIntegration(integrationId)}/test`);
  }

  /**
   * Create integration
   * entities: array of 0-N entity IDs to connect
   * @param {Array<string>} entities - Entity IDs
   * @param {object} config - Integration configuration
   * @returns {Promise<Object>}
   */
  async createIntegration(entities, config) {
    const url = `${this.endpointIntegrations}`;
    const params = {
      entities,
      config,
    };
    return this._post(url, params);
  }

  /**
   * Update integration
   * @param {string} integrationId - Integration ID
   * @param {object} config - Integration configuration
   * @returns {Promise<Object>}
   */
  async updateIntegration(integrationId, config) {
    const url = this.endpointIntegration(integrationId);
    const params = {
      config,
    };
    return this._patch(url, params);
  }

  /**
   * Delete integration
   * @param {string} integrationId - Integration ID
   * @returns {Promise<Object>}
   */
  async deleteIntegration(integrationId) {
    const url = this.endpointIntegration(integrationId);
    return this._delete(url, {});
  }

  /**
   * Get integration config options
   * @param {string} integrationId - Integration ID
   * @returns {Promise<Object>}
   */
  async getIntegrationConfigOptions(integrationId) {
    const url = this.endpointIntegrationConfigOptions(integrationId);
    return this._get(url);
  }

  /**
   * Get sample data
   * @param {string} integrationId - Integration ID
   * @returns {Promise<Object>}
   */
  async getSampleData(integrationId) {
    const url = this.endpointSampleData(integrationId);
    return this._get(url);
  }

  // =========================================================================
  // USER ACTIONS
  // =========================================================================

  async deleteAll(integrationId) {
    const url = this.endpointIntegrationUserActionOptions(
      integrationId,
      "DELETE_ALL_CUSTOM_OBJECTS"
    );
    return this._post(url);
  }

  async getUserActions(integrationId, actionType) {
    const url = this.endpointIntegrationUserActions(integrationId);
    return this._post(url, { actionType });
  }

  async getUserActionOptions(integrationId, selectedUserAction, data) {
    const url = this.endpointIntegrationUserActionOptions(
      integrationId,
      selectedUserAction
    );
    return this._post(url, data);
  }

  async submitUserAction(integrationId, selectedUserAction, data) {
    const url = this.endpointIntegrationUserActionSubmit(
      integrationId,
      selectedUserAction
    );
    return this._post(url, data);
  }

  async refreshOptions({ endpoint, data }) {
    return this._post(endpoint, data);
  }
}
