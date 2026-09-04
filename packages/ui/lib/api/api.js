export default class API {
  constructor(baseUrl, jwt) {
    this.baseURL = baseUrl;
    this.jwt = jwt;

    this.endpointLogin = "/user/login";
    this.endpointCreateUser = "/user/create";

    this.endpointAuthorize = "/api/authorize";
    this.endpointIntegration = (id) => `/api/integrations/${id}`;
    this.endpointIntegrationConfigOptions = (id) =>
      `${this.endpointIntegration(id)}/config/options`;
    this.endpointIntegrations = "/api/integrations";
    this.endpointIntegration = (id) => `/api/integrations/${id}`;
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

  // get the list of integrations for this token
  async listIntegrations() {
    return this._get(this.endpointIntegrations);
  }

  // get authorize url with the following params:
  // ?entityType=Freshbooks&connectingEntityType=Saleforce
  async getAuthorizeRequirements(entityType, connectingEntityType) {
    const url = `${this.endpointAuthorize}?entityType=${entityType}&connectingEntityType=${connectingEntityType}`;
    return this._get(url);
  }

  async authorize(entityType, authData) {
    const url = `${this.endpointAuthorize}`;
    const params = {
      entityType,
      data: authData,
    };
    return this._post(url, params);
  }

  // create integration. on success returns the integration id along with its configuration
  async createIntegration(entity1, entity2, config) {
    const url = `${this.endpointIntegrations}`;
    const params = {
      entities: [entity1, entity2],
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
}
