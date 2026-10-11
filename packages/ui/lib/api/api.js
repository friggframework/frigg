const API_VERSIONS = ["v1", "v2"];
const DEFAULT_API_VERSION = "v1";
const CLIENT_ID = "@friggframework/ui";

/**
 * Thrown when the Frigg backend does not serve the Management API version
 * this client was configured for (ADR-053 §8).
 */
export class FriggApiVersionError extends Error {
  constructor(message, { served = [] } = {}) {
    super(message);
    this.name = "FriggApiVersionError";
    this.served = served;
  }
}

/**
 * Client for a Frigg backend's Management API.
 *
 * `apiVersion` picks the contract (ADR-053):
 * - "v1" (default in 2.0.1): the original unprefixed routes. Deprecated.
 * - "v2": the /api/v2 routes. Before the first call the client reads
 *   GET /api/meta and throws FriggApiVersionError if the backend does not
 *   serve v2 (core older than 2.0.1, or v2 disabled).
 *
 * The methods the bundled components use (listIntegrations, authorize,
 * getAuthorizeRequirements, ...) keep their v1 return shapes in both modes,
 * so components work unchanged. The v2-only methods below them return the v2
 * shapes and always use /api/v2.
 */
export default class API {
  /**
   * @param {string} baseUrl
   * @param {string} [jwt]
   * @param {{ apiVersion?: "v1" | "v2" }} [options]
   */
  constructor(baseUrl, jwt, options = {}) {
    const apiVersion = options.apiVersion ?? DEFAULT_API_VERSION;
    if (!API_VERSIONS.includes(apiVersion)) {
      throw new Error(
        `apiVersion must be one of ${API_VERSIONS.join(", ")}; got ${apiVersion}`
      );
    }
    this.baseURL = baseUrl;
    this.jwt = jwt;
    this.apiVersion = apiVersion;
    this._metaPromise = null;

    this.endpointLogin = "/user/login";
    this.endpointCreateUser = "/user/create";
    this.endpointSampleData = (id) => `/api/demo/sample/${id}`;

    const prefix = apiVersion === "v2" ? "/api/v2" : "/api";
    this.endpointAuthorize = `${prefix}/authorize`;
    this.endpointIntegrations = `${prefix}/integrations`;
    this.endpointIntegration = (id) => `${prefix}/integrations/${id}`;
    this.endpointIntegrationConfigOptions = (id) =>
      `${this.endpointIntegration(id)}/config/options`;
    this.endpointIntegrationUserActions = (id) =>
      `${this.endpointIntegration(id)}/actions`;
    this.endpointIntegrationUserActionOptions = (id, action) =>
      `${this.endpointIntegration(id)}/actions/${action}/options`;
    this.endpointIntegrationUserActionSubmit = (id, action) =>
      `${this.endpointIntegration(id)}/actions/${action}`;
  }

  get isV2() {
    return this.apiVersion === "v2";
  }

  async login(username, password) {
    return this._post(this.endpointLogin, { username, password });
  }

  async createUser(username, password) {
    return this._post(this.endpointCreateUser, { username, password });
  }

  // injects the access token into an object and returns the headers for most api calls
  getHeaders() {
    const headers = {
      "Content-Type": "application/json",
      "Frigg-Client": CLIENT_ID,
    };

    if (this.jwt) {
      headers.authorization = `Bearer ${this.jwt}`;
    }

    return headers;
  }

  // =========================================================================
  // DISCOVERY (ADR-053 §4)
  // =========================================================================

  /**
   * GET /api/meta: the API versions and capabilities this backend serves.
   * Cached for the life of this client. Resolves to null when the backend
   * predates /api/meta (core < 2.0.1).
   */
  async getMeta() {
    if (!this._metaPromise) {
      this._metaPromise = (async () => {
        const url = `${this.baseURL}/api/meta`;
        const response = await fetch(url, {
          method: "GET",
          headers: { "Frigg-Client": CLIENT_ID },
        });
        if (response.status === 404) return null;
        if (response.status >= 400) {
          throw new Error(`GET /api/meta failed with HTTP ${response.status}`);
        }
        return response.json();
      })().catch((error) => {
        this._metaPromise = null;
        throw error;
      });
    }
    return this._metaPromise;
  }

  /** True when GET /api/meta lists the capability (e.g. "entityProxy"). */
  async hasCapability(capability) {
    const meta = await this.getMeta();
    return Boolean(meta?.capabilities?.includes(capability));
  }

  /**
   * Resolves when the backend serves Management API v2; otherwise throws
   * FriggApiVersionError with an upgrade message.
   */
  async ensureV2() {
    const meta = await this.getMeta();
    const versions = meta?.api?.versions || {};
    const served = Object.entries(versions)
      .filter(([, info]) => info?.status !== "disabled")
      .map(([major]) => `v${major}`);
    const v2 = versions["2"];
    if (!v2 || v2.status === "disabled") {
      throw new FriggApiVersionError(
        `${CLIENT_ID} is configured for Management API v2, which needs @friggframework/core >= 2.0.1. ` +
          `This server serves: ${served.length ? served.join(", ") : "v1"}. ` +
          'Upgrade core on the backend, or create the client with { apiVersion: "v1" }.',
        { served: served.length ? served : ["v1"] }
      );
    }
    return meta;
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

      return await response.json();
    } catch (exception) {
      if (response.error === null || response.error === undefined) {
        return { error: null };
      }
      return { error: JSON.stringify(response) };
    }
  }

  async _send(method, endpoint, data) {
    if (endpoint.startsWith("/api/v2/")) await this.ensureV2();
    const url = `${this.baseURL}${endpoint}`;
    const init = { method, headers: this.getHeaders() };
    if (data !== undefined) init.body = JSON.stringify(data);
    const response = await fetch(url, init);
    return this._checkResponse(response, url);
  }

  // method to route all GET requests thru this function
  async _get(endpoint) {
    return this._send("GET", endpoint);
  }

  // method to route all POST requests thru this function
  async _post(endpoint, data) {
    return this._send("POST", endpoint, data);
  }

  // method to route all PATCH requests thru this function
  async _patch(endpoint, data) {
    return this._send("PATCH", endpoint, data);
  }

  // method to route all DELETE requests thru this function
  async _delete(endpoint, data) {
    return this._send("DELETE", endpoint, this.isV2 ? undefined : data);
  }

  // =========================================================================
  // METHODS THE BUNDLED COMPONENTS USE (v1 return shapes in both modes)
  // =========================================================================

  /**
   * Integrations plus integration options and authorized entities, in the v1
   * combined shape `{ entities: { options, authorized }, integrations }`.
   * In v2 mode it is assembled from three v2 calls.
   */
  async listIntegrations() {
    if (!this.isV2) return this._get(this.endpointIntegrations);
    const [integrations, options, entities] = await Promise.all([
      this.listIntegrationsV2(),
      this.listIntegrationOptions(),
      this.listEntities(),
    ]);
    return {
      entities: {
        options: options?.integrations ?? [],
        authorized: entities?.entities ?? [],
      },
      integrations: integrations?.integrations ?? [],
    };
  }

  // get authorize url with the following params:
  // ?entityType=Freshbooks&connectingEntityType=Saleforce
  // In v2 mode the requirements also carry step, totalSteps, isMultiStep and
  // sessionId, and an OAuth2 url is copied to the top level as in v1.
  async getAuthorizeRequirements(entityType, connectingEntityType, step, sessionId) {
    if (!this.isV2) {
      const url = `${this.endpointAuthorize}?entityType=${entityType}&connectingEntityType=${connectingEntityType}`;
      return this._get(url);
    }
    const requirements = await this.getAuthorizationStep(entityType, {
      step,
      sessionId,
    });
    if (requirements?.data?.url && !requirements.url) {
      return { ...requirements, url: requirements.data.url };
    }
    return requirements;
  }

  /**
   * Submits authorization data. In v2 mode a completed flow also carries the
   * v1 fields (entity_id, credential_id, type); a pending one is returned as
   * is ({ status: "pending", step, sessionId, requirements }).
   */
  async authorize(entityType, authData, step, sessionId) {
    if (!this.isV2) {
      return this._post(this.endpointAuthorize, {
        entityType,
        data: authData,
      });
    }
    const result = await this.submitAuthorizationStep(entityType, authData, {
      step,
      sessionId,
    });
    if (result?.status === "complete") {
      return {
        ...result,
        entity_id: result.entity?.id,
        credential_id: result.credential?.id,
        type: result.entity?.type,
      };
    }
    return result;
  }

  // create integration. on success returns the integration id along with its configuration
  async createIntegration(entity1, entity2, config) {
    const entities = Array.isArray(entity1)
      ? entity1
      : [entity1, entity2].filter((id) => id !== undefined && id !== null);
    return this._post(this.endpointIntegrations, { entities, config });
  }

  async updateIntegration(integrationId, config) {
    return this._patch(this.endpointIntegration(integrationId), { config });
  }

  async deleteIntegration(integrationId) {
    return this._delete(this.endpointIntegration(integrationId), {});
  }

  async getIntegrationConfigOptions(integrationId) {
    return this._get(this.endpointIntegrationConfigOptions(integrationId));
  }

  async getSampleData(integrationId) {
    return this._get(this.endpointSampleData(integrationId));
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
    if (this.isV2) {
      const query = actionType
        ? `?actionType=${encodeURIComponent(actionType)}`
        : "";
      return this._get(`${url}${query}`);
    }
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
  // MANAGEMENT API v2 (always /api/v2; v2 response shapes)
  // =========================================================================

  /** GET /api/v2/integrations -> { integrations } */
  async listIntegrationsV2() {
    return this._get("/api/v2/integrations");
  }

  /** GET /api/v2/integrations/options -> { integrations } (types this app offers) */
  async listIntegrationOptions() {
    return this._get("/api/v2/integrations/options");
  }

  /** GET /api/v2/integrations/:id */
  async getIntegration(integrationId) {
    return this._get(`/api/v2/integrations/${integrationId}`);
  }

  /** GET /api/v2/integrations/:id/test-auth -> { status: "ok" | "failed", errors? } */
  async testIntegrationAuth(integrationId) {
    return this._get(`/api/v2/integrations/${integrationId}/test-auth`);
  }

  /** GET /api/v2/entities -> { entities } */
  async listEntities() {
    return this._get("/api/v2/entities");
  }

  /** GET /api/v2/entities/:id */
  async getEntity(entityId) {
    return this._get(`/api/v2/entities/${entityId}`);
  }

  /** DELETE /api/v2/entities/:id (409 while integrations use it) */
  async deleteEntity(entityId) {
    return this._delete(`/api/v2/entities/${entityId}`);
  }

  /** GET /api/v2/entities/:id/test-auth -> { status: "ok" | "failed" } */
  async testEntityAuth(entityId) {
    return this._get(`/api/v2/entities/${entityId}/test-auth`);
  }

  /** GET /api/v2/entities/:id/options */
  async getEntityOptions(entityId) {
    return this._get(`/api/v2/entities/${entityId}/options`);
  }

  /** POST /api/v2/entities/:id/options/refresh */
  async refreshEntityOptions(entityId, data = {}) {
    return this._post(`/api/v2/entities/${entityId}/options/refresh`, data);
  }

  /** GET /api/v2/entities/types -> { types } */
  async listEntityTypes() {
    return this._get("/api/v2/entities/types");
  }

  /** GET /api/v2/entities/types/:type */
  async getEntityType(entityType) {
    return this._get(`/api/v2/entities/types/${encodeURIComponent(entityType)}`);
  }

  /** GET /api/v2/entities/types/:type/requirements?step= (does not start a session) */
  async getEntityTypeRequirements(entityType, step = 1) {
    return this._get(
      `/api/v2/entities/types/${encodeURIComponent(entityType)}/requirements?step=${step}`
    );
  }

  /**
   * GET /api/v2/authorize: start (step 1) or continue a flow.
   * @returns {Promise<{type, data, step, totalSteps, isMultiStep, sessionId?}>}
   */
  async getAuthorizationStep(entityType, { step, sessionId, state } = {}) {
    const params = new URLSearchParams({ entityType });
    if (step) params.set("step", String(step));
    if (sessionId) params.set("sessionId", sessionId);
    if (state) params.set("state", state);
    return this._get(`/api/v2/authorize?${params}`);
  }

  /**
   * POST /api/v2/authorize: submit one step.
   * @returns {Promise<{status: "complete", entity, credential} | {status: "pending", step, totalSteps, sessionId, requirements, message?}>}
   */
  async submitAuthorizationStep(entityType, data, { step, sessionId } = {}) {
    const body = { entityType, data };
    if (step) body.step = step;
    if (sessionId) body.sessionId = sessionId;
    return this._post("/api/v2/authorize", body);
  }

  /** GET /api/v2/credentials -> { credentials } (masked) */
  async listCredentials() {
    return this._get("/api/v2/credentials");
  }

  /** GET /api/v2/credentials/:id (masked) */
  async getCredential(credentialId) {
    return this._get(`/api/v2/credentials/${credentialId}`);
  }

  /** DELETE /api/v2/credentials/:id */
  async deleteCredential(credentialId) {
    return this._delete(`/api/v2/credentials/${credentialId}`);
  }

  /** GET /api/v2/credentials/:id/reauthorize */
  async getCredentialReauthorizeRequirements(credentialId, { step, sessionId } = {}) {
    const params = new URLSearchParams();
    if (step) params.set("step", String(step));
    if (sessionId) params.set("sessionId", sessionId);
    const query = params.toString() ? `?${params}` : "";
    return this._get(`/api/v2/credentials/${credentialId}/reauthorize${query}`);
  }

  /** POST /api/v2/credentials/:id/reauthorize */
  async reauthorizeCredential(credentialId, data, { step, sessionId } = {}) {
    const body = { data };
    if (step) body.step = step;
    if (sessionId) body.sessionId = sessionId;
    return this._post(`/api/v2/credentials/${credentialId}/reauthorize`, body);
  }

  /**
   * POST /api/v2/entities/:id/proxy (beta, only when the backend enables
   * it; check hasCapability("entityProxy")).
   * @param {{method: string, path: string, query?: object, headers?: object, body?: unknown}} request
   */
  async proxyEntityRequest(entityId, request) {
    return this._post(`/api/v2/entities/${entityId}/proxy`, request);
  }
}
