export default class API {
  constructor(baseUrl, jwt) {
    this.baseURL = baseUrl;
    this.jwt = jwt;

    this.endpointLogin = "/user/login";
    this.endpointCreateUser = "/user/create";

    // v2 API endpoints (path-based versioning)
    this.endpointAuthorize = "/api/v2/authorize";
    this.endpointIntegration = (id) => `/api/v2/integrations/${id}`;
    this.endpointIntegrationConfigOptions = (id) =>
      `${this.endpointIntegration(id)}/config/options`;
    this.endpointIntegrations = "/api/v2/integrations";
    this.endpointSampleData = (id) => `/api/demo/sample/${id}`;
    this.endpointIntegrationUserActions = (id) =>
      `/api/v2/integrations/${id}/actions`;
    this.endpointIntegrationUserActionOptions = (id, action) =>
      `/api/v2/integrations/${id}/actions/${action}/options`;
    this.endpointIntegrationUserActionSubmit = (id, action) =>
      `/api/v2/integrations/${id}/actions/${action}`;
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

  // Get user's installed integrations
  // Returns: { integrations: [] }
  async listIntegrations() {
    return this._get(this.endpointIntegrations);
  }

  // Get available integration types/options configured in the Frigg instance
  async listIntegrationOptions() {
    return this._get(`${this.endpointIntegrations}/options`);
  }

  // Get user's authorized entities/connected accounts
  async listEntities() {
    return this._get('/api/v2/entities');
  }

  // =========================================================================
  // ENTITY TYPES ENDPOINTS (v2 API - replaces /api/modules)
  // =========================================================================

  // Get available entity types (replaces listModules)
  async listEntityTypes() {
    return this._get('/api/v2/entities/types');
  }

  // Alias for backward compatibility
  async listModules() {
    return this.listEntityTypes();
  }

  // Get entity type details
  async getEntityType(entityType) {
    return this._get(`/api/v2/entities/types/${entityType}`);
  }

  // Get authorization requirements for entity type (replaces getModuleAuthorizationRequirements)
  async getEntityTypeAuthorizationRequirements(entityType, step = 1, sessionId = null) {
    let url = `/api/v2/entities/types/${entityType}/requirements?step=${step}`;
    if (sessionId) {
      url += `&sessionId=${sessionId}`;
    }
    return this._get(url);
  }

  // Alias for backward compatibility
  async getModuleAuthorizationRequirements(moduleType, step = 1, sessionId = null) {
    return this.getEntityTypeAuthorizationRequirements(moduleType, step, sessionId);
  }

  // Submit authorization step via /api/v2/authorize
  async submitModuleAuthorization(moduleType, data, step = null, sessionId = null, credentialId = null) {
    const params = { entityType: moduleType, data };
    if (step) params.step = step;
    if (sessionId) params.sessionId = sessionId;
    if (credentialId) params.credentialId = credentialId;

    return this._post('/api/v2/authorize', params);
  }

  // =========================================================================
  // CREDENTIAL ENDPOINTS (v2 API)
  // =========================================================================

  async listCredentials(filters = {}) {
    let url = '/api/v2/credentials';
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.moduleType) params.append('moduleType', filters.moduleType);

    if (params.toString()) url += '?' + params.toString();
    return this._get(url);
  }

  async getCredential(credentialId) {
    return this._get(`/api/v2/credentials/${credentialId}`);
  }

  async deleteCredential(credentialId, cascade = false) {
    const url = `/api/v2/credentials/${credentialId}${cascade ? '?cascade=true' : ''}`;
    return this._delete(url, {});
  }

  async testCredential(credentialId) {
    return this._get(`/api/v2/credentials/${credentialId}/test`);
  }

  async resumeFromCredential(credentialId) {
    return this._post(`/api/v2/credentials/${credentialId}/resume`, {});
  }

  async getCredentialOptions(credentialId) {
    return this._get(`/api/v2/credentials/${credentialId}/options`);
  }

  // =========================================================================
  // ENTITY ENDPOINTS (v2 API)
  // =========================================================================

  // Get user's authorized entities/connected accounts
  async listEntities(filters = {}) {
    let url = '/api/v2/entities';
    if (filters.moduleType) {
      url += `?moduleType=${filters.moduleType}`;
    }
    return this._get(url);
  }

  async getEntity(entityId) {
    return this._get(`/api/v2/entities/${entityId}`);
  }

  async deleteEntity(entityId, deleteCredential = false) {
    const url = `/api/v2/entities/${entityId}${deleteCredential ? '?deleteCredential=true' : ''}`;
    return this._delete(url, {});
  }

  // UPDATED: Renamed from testEntityAuth
  async testEntity(entityId) {
    return this._get(`/api/v2/entities/${entityId}/test`);
  }

  // NEW: Re-authentication flow
  async initiateEntityReauthorization(entityId) {
    return this._post(`/api/v2/entities/${entityId}/reauthorize`, {});
  }

  async completeEntityReauthorization(entityId, data) {
    return this._post(`/api/v2/entities/${entityId}/reauthorize/complete`, data);
  }

  async getEntityOptions(entityId, optionType = null) {
    const data = optionType ? { optionType } : {};
    return this._post(`/api/v2/entities/${entityId}/options`, data);
  }

  async refreshEntityOptions(entityId, optionType = null) {
    const data = optionType ? { optionType } : {};
    return this._post(`/api/v2/entities/${entityId}/options/refresh`, data);
  }

  // =========================================================================
  // PROXY ENDPOINTS (v2 API - for MCP/tool-calling use cases)
  // =========================================================================

  /**
   * Proxy an API request through an entity's authenticated connection
   * @param {string} entityId - Entity ID to proxy through
   * @param {object} proxyRequest - Proxy request configuration
   * @param {string} proxyRequest.method - HTTP method (GET, POST, PUT, PATCH, DELETE)
   * @param {string} proxyRequest.path - API path to call
   * @param {object} [proxyRequest.query] - Query parameters
   * @param {object} [proxyRequest.headers] - Additional headers
   * @param {*} [proxyRequest.body] - Request body
   * @returns {Promise<object>} Proxy response with status, headers, data
   */
  async proxyEntityRequest(entityId, proxyRequest) {
    return this._post(`/api/v2/entities/${entityId}/proxy`, proxyRequest);
  }

  /**
   * Proxy an API request through a credential's authenticated connection
   * @param {string} credentialId - Credential ID to proxy through
   * @param {object} proxyRequest - Proxy request configuration
   * @returns {Promise<object>} Proxy response with status, headers, data
   */
  async proxyCredentialRequest(credentialId, proxyRequest) {
    return this._post(`/api/v2/credentials/${credentialId}/proxy`, proxyRequest);
  }

  // =========================================================================
  // LEGACY ENDPOINTS (BACKWARD COMPATIBILITY)
  // =========================================================================

  // get authorize url with the following params:
  // ?entityType=Freshbooks&connectingEntityType=Saleforce&step=1&sessionId=xxx
  // Supports multi-step auth (step defaults to 1 for backward compatibility)
  async getAuthorizeRequirements(entityType, connectingEntityType = '', step = 1, sessionId = null) {
    let url = `${this.endpointAuthorize}?entityType=${entityType}&connectingEntityType=${connectingEntityType}&step=${step}`;
    if (sessionId) {
      url += `&sessionId=${sessionId}`;
    }
    return this._get(url);
  }

  // Simplified method for getting authorization requirements for a single entity type
  // Used when connecting a new account during integration builder flow
  async getAuthorizationRequirements(entityType) {
    const url = `${this.endpointAuthorize}?entityType=${entityType}`;
    return this._get(url);
  }

  // Submit authorization step
  // Supports multi-step auth (step defaults to 1 for single-step flows)
  async authorize(entityType, authData, step = 1, sessionId = null) {
    const url = `${this.endpointAuthorize}`;
    const params = {
      entityType,
      data: authData,
      step,
    };
    if (sessionId) {
      params.sessionId = sessionId;
    }
    return this._post(url, params);
  }

  // create integration. on success returns the integration id along with its configuration
  // entities: array of 0-N entity IDs to connect
  async createIntegration(entities, config) {
    const url = `${this.endpointIntegrations}`;
    const params = {
      entities,
      config,
    };
    return this._post(url, params);
  }

  async updateIntegration(integrationId, config) {
    const url = this.endpointIntegration(integrationId);
    const params = {
      config,
    };
    return this._patch(url, params);
  }

  async deleteIntegration(integrationId) {
    const url = this.endpointIntegration(integrationId);
    return this._delete(url, {});
  }

  async getIntegrationConfigOptions(integrationId) {
    const url = this.endpointIntegrationConfigOptions(integrationId);
    return this._get(url);
  }

  async getSampleData(integrationId) {
    const url = this.endpointSampleData(integrationId);
    return this._get(url);
  }

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

  // =========================================================================
  // SYSTEM ACTIONS ENDPOINTS (DEV MODE - v2 API)
  // =========================================================================

  // Get available system actions for an integration
  async getSystemActions(integrationId) {
    return this._get(`/api/v2/integrations/${integrationId}/system-actions`);
  }

  // Execute a system action (webhook, polling, queue worker, etc.)
  async executeSystemAction(integrationId, actionType, config) {
    return this._post(`/api/v2/integrations/${integrationId}/system-actions/${actionType}`, config);
  }

  // Trigger a webhook event
  async triggerWebhook(integrationId, webhookConfig) {
    return this._post(`/api/v2/integrations/${integrationId}/webhooks/trigger`, webhookConfig);
  }

  // Start/stop polling for an integration
  async togglePolling(integrationId, enabled, config = {}) {
    return this._post(`/api/v2/integrations/${integrationId}/polling`, {
      enabled,
      config
    });
  }

  // Execute a queue worker job
  async executeQueueWorker(integrationId, jobConfig) {
    return this._post(`/api/v2/integrations/${integrationId}/queue-worker`, jobConfig);
  }

  // Trigger a lifecycle event
  async triggerLifecycleEvent(integrationId, event, data = {}) {
    return this._post(`/api/v2/integrations/${integrationId}/lifecycle-events`, {
      event,
      data
    });
  }

  // Get system action logs
  async getSystemActionLogs(integrationId, actionType = null, limit = 100) {
    let url = `/api/v2/integrations/${integrationId}/system-actions/logs?limit=${limit}`;
    if (actionType) {
      url += `&actionType=${actionType}`;
    }
    return this._get(url);
  }
}
