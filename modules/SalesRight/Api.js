const fetch = require("node-fetch");
const OAuth2Base = require("@friggframework/core/auth/OAuth2Base.js");
const { get } = require("@friggframework/assertions");

class Api extends OAuth2Base {
  constructor(params) {
    super(params);
    this.apiKey = get(params, "apiKey", null);
    this.baseUrl = process.env.SALESRIGHT_BASE_URL;
    this.clientId = process.env.SALESRIGHT_CLIENT_ID;
    this.key = process.env.SALESRIGHT_CLIENT_ID;
    this.clientSecret = process.env.SALESRIGHT_CLIENT_SECRET;
    this.secret = process.env.SALESRIGHT_CLIENT_SECRET;
    this.redirectUri = process.env.SALESRIGHT_REDIRECT_URI;
    this.state = get(params, "state", null);
    this.delegate = get(params, "delegate", null);
    this.scope = "full_access";

    // Endpoints appended to baseUrl
    this.URLs = {
      auth: {
        signin: "/auth/signin", // sign in
        me: "/auth/me", // exchange access token for API key
        rotateKey: "/auth/rotatekey", // rotate API key
      },
      oauth: {
        authorizePage: "/oauth/index.html", // OAuth landing page for Authorization
        authorize: "/oauth/authorize", // OAuth URL for retrieving code via 'direct'
        token: "/oauth/token", // OAuth URL for retrieving access_token from `code` or `refresh_token`
      },
      activities: "/activities",
      webhooks: "/webhooks",
      findQuote: "/quotes/search",
      quotes: "/quotes",
      organization: "/my-organization",
      getQuote: (quoteId) => `/quotes/${quoteId}`,
      closedWon: (quoteId) => `/quotes/${quoteId}/closed-won`,
      closedLost: (quoteId) => `/quotes/${quoteId}/closed-lost`,
      getPublishedQuote: (publishedQuoteId) =>
        `/published-quotes/${publishedQuoteId}`,
      companies: "/companies",
      company: (companyId) => `/companies/${companyId}`,
      contacts: "/contacts",
      contact: (contactId) => `/contacts/${contactId}`,
      getQuoteBreakdown: (quoteId) => `/quotes/${quoteId}/breakdown`,
      getPublishedQuoteBreakdown: (publishedQuoteId) =>
        `/published-quotes/${publishedQuoteId}/breakdown`,
    };

    // Webhook topics for events in SalesRight -- added to POST body for creating a webhook
    this.webhookTopics = {
      createdQuote: "quotes/create",
      updatedQuote: "quotes/update",
      createdActivity: "activities/create", // when a new Activity for a Quote is created
    };
  }

  getAuthorizationHeaders() {
    const headers = {};
    if (this.apiKey) {
      headers.api_key = this.apiKey;
    }

    if (this.access_token) {
      headers.Authorization = `Bearer ${this.access_token}`;
    }

    return headers;
  }

  // REGULAR USER AUTH REQUESTS
  async signInUser(params) {
    const email = get(params, "email");
    const password = get(params, "password");

    const body = {
      email,
      password,
    };

    const res = await this._post(this.URLs.auth.signin, body);

    return res;
  }

  async getApiKeyFromJwt(params) {
    const jwt = get(params, "jwt");

    await this.setAccessToken(jwt);
    const res = await this._get(this.URLs.auth.me);
    const { api_key: apiKey } = res.organization;
    this.apiKey = apiKey;
    return this.apiKey;
  }

  // OAUTH RELATED REQUESTS

  /**
   * This function leverages the OAuth /authorize endpoint to generate a code for use in
   * generating an access_token, bypassing the OAuth authorization screen
   * @param jwt
   * @returns code, amongst other object pieces
   */

  async setAccessToken(accessToken) {
    this.access_token = accessToken;
  }

  setClientId(clientId) {
    this.clientId = clientId;
    this.key = clientId;
  }

  setClientSecret(clientSecret) {
    this.clientSecret = clientSecret;
    this.secret = clientSecret;
  }

  setRedirectUri(redirectUri) {
    this.redirectUri = redirectUri;
  }

  setOAuthCredentials(params) {
    this.setClientId(params.key);
    this.setClientSecret(params.secret);
    this.setRedirectUri(params.redirectUri);
    this.delegate = params.delegate;
  }

  async getCodeFromJwt(jwt) {
    const params = new URLSearchParams();
    params.append("jwt", jwt);
    params.append("response_type", "code");
    params.append("client_id", this.clientId);
    params.append("redirect_uri", this.redirectUri);
    params.append("scope", this.scope);
    params.append("response_mode", "direct");
    params.append("state", this.state);
    try {
      const options = {
        method: "POST",
        body: params,
      };
      console.log(options);
      const response = await fetch(
        `${this.baseUrl}${this.URLs.oauth.authorize}`,
        options
      );
      const responseJSON = await response.json();
      console.log(`Code retrieved : ${JSON.stringify(responseJSON)}`);
      return responseJSON;
    } catch (e) {
      throw new Error(e);
    }
  }

  // OAuth Access Toekn Creation default
  async getTokenFromCode(code) {
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("client_id", this.clientId);
    params.append("client_secret", this.clientSecret);
    params.append("redirect_uri", this.redirectUri);
    params.append("scope", this.scope);
    params.append("code", code);
    try {
      const options = {
        method: "POST",
        body: params,
      };
      console.log(options);
      const response = await fetch(
        `${this.baseUrl}${this.URLs.oauth.token}`,
        options
      );
      const responseJSON = await response.json();
      console.log(`Tokens created : ${JSON.stringify(responseJSON)}`);
      await this.setTokens(responseJSON);
      return responseJSON;
    } catch (e) {
      throw new Error(e);
    }
  }

  // OAuth Access Token Refresh default
  async refreshAccessToken() {
    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("client_id", this.clientId);
    params.append("client_secret", this.clientSecret);
    params.append("refresh_token", this.refreshToken);
    params.append("redirect_uri", this.redirectUri);
    try {
      const options = {
        method: "POST",
        body: params,
      };
      const response = await fetch(
        `${this.baseUrl}${this.URLs.oauth.token}`,
        options
      );
      console.log(response);
      const responseJSON = await response.json();
      console.log(`Tokens refreshed : ${JSON.stringify(responseJSON)}`);
      await this.setTokens(responseJSON);
      return responseJSON;
    } catch (e) {
      throw new Error(e);
    }
  }

  // check the response of a fetch() before returning the data in JSON form.
  // may throw an exception if the response.status corresponds to an error
  async _checkResponse(response, url, retryCount = 3, callback) {
    if (response.status === 400)
      this.throwException(
        `http [${response.status}] ${url}: ${JSON.stringify(
          await response.json()
        )}`
      );
    if (response.status === 401) {
      try {
        await this.refreshAccessToken();
        return callback();
      } catch (e) {
        this.throwException(
          `http [${response.status}] ${url}: ${JSON.stringify(
            await response.json()
          )}`
        );
      }
    }
    if (response.status > 401) {
      if (retryCount > 0) {
        try {
          return callback();
        } catch (e) {
          this.throwException(
            `http [${response.status}] ${url}: ${JSON.stringify(
              await response.json()
            )}`
          );
        }
      } else {
        this.throwException(
          `http [${response.status}] ${url}: ${JSON.stringify(
            await response.json()
          )}`
        );
      }
    }
    try {
      // if the method is DELETE and no JSON response
      if (response.status === 204) {
        return response;
      }
      if (response.headers.get("content-type") === "text/html")
        return response.text();
      return response.json();
    } catch (exception) {
      if (response.error === null || response.error === undefined) {
        return { error: null };
      }
      return { error: JSON.stringify(response) };
    }
  }

  async getOrganizationDetails() {
    const res = await this._get(this.URLs.organization);
    return res;
  }

  // base calls
  // GET for all calls - Headers can include an API key or access token, usually API key
  async _get(url, params, retryCount = 3) {
    const esc = encodeURIComponent;
    let query = "";
    if (params) {
      query = "?";
      query += Object.keys(params)
        .map((k) => `${esc(k)}=${esc(params[k])}`)
        .join("&");
    }

    const headers = this.getAuthorizationHeaders();
    headers["Content-Type"] = "application/json";
    const options = {
      method: "GET",
      headers,
    };

    const newUrl = `${this.baseUrl}${url}${query}`;

    const res = await fetch(newUrl, options);
    return this._checkResponse(
      res,
      newUrl,
      retryCount,
      async () => await this._get(url, params, retryCount - 1)
    );
  }

  async _getHtml(url, params, retryCount = 3) {
    const esc = encodeURIComponent;
    let query = "";
    if (params) {
      query = "?";
      query += Object.keys(params)
        .map((k) => `${esc(k)}=${esc(params[k])}`)
        .join("&");
    }

    const headers = this.getAuthorizationHeaders();
    headers["Content-Type"] = "text/html";
    const options = {
      method: "GET",
      headers,
    };

    const newUrl = `${this.baseUrl}${url}${query}`;

    const res = await fetch(newUrl, options);
    return this._checkResponse(
      res,
      newUrl,
      retryCount,
      async () => await this._getHtml(url, params, retryCount - 1)
    );
  }

  // POST for all calls
  async _post(url, body, retryCount = 3) {
    const newUrl = this.baseUrl + url;

    const headers = this.getAuthorizationHeaders();
    headers["Content-Type"] = "application/json";

    const options = {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    };
    const res = await fetch(newUrl, options);
    return this._checkResponse(
      res,
      newUrl,
      retryCount,
      async () => await this._post(url, body, retryCount - 1)
    );
  }

  // PATCH for all calls - headers not included in arguments since they are always the same (api_key and Content-Type)
  async _patch(url, body, retryCount = 3) {
    const newUrl = this.baseUrl + url;

    const headers = this.getAuthorizationHeaders();
    headers["Content-Type"] = "application/json";

    const options = {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    };
    const res = await fetch(newUrl, options);
    return this._checkResponse(
      res,
      newUrl,
      retryCount,
      async () => await this._get(url, body, retryCount - 1)
    );
  }

  // PUT for all calls - headers not included in arguments since they are always the same (api_key and Content-Type)
  async _put(url, body, retryCount = 3) {
    const newUrl = this.baseUrl + url;
    console.log(`Attempting a PUT with a body of ${JSON.stringify(body)}`);

    const headers = this.getAuthorizationHeaders();
    headers["Content-Type"] = "application/json";

    const options = {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    };
    const res = await fetch(newUrl, options);
    return this._checkResponse(
      res,
      newUrl,
      retryCount,
      async () => await this._put(url, body, retryCount - 1)
    );
  }

  // DELETE for deleting webhooks
  async _delete(url, retryCount = 3) {
    const newUrl = this.baseUrl + url;

    const headers = this.getAuthorizationHeaders();
    headers["Content-Type"] = "application/json";

    const options = {
      method: "DELETE",
      headers,
    };
    const res = await fetch(newUrl, options);
    return this._checkResponse(
      res,
      newUrl,
      retryCount,
      async () => await this._delete(url, retryCount - 1)
    );
  }

  // Return array of quote objects
  async listQuotes() {
    const res = await this._get(this.URLs.quotes);
    return res;
  }

  // Return array of contact objects, optionally filtered by companyId

  async listContacts(filter) {
    const companyId = get(filter, "companyId", null);
    const params = {};
    if (companyId) {
      params.companyId = companyId;
    }
    const res = await this._get(this.URLs.contacts, params);
    return res;
  }

  // Creates and returns a Contact from the provided data
  async createContact(data) {
    const firstName = get(data, "firstName");
    const lastName = get(data, "lastName");
    const email = get(data, "email");
    const sourceId = get(data, "sourceId", null);
    const sourceType = get(data, "sourceType", null);
    const phone = get(data, "phone", null);
    const sourceLink = get(data, "sourceLink", null);
    const companyId = get(data, "companyId");

    const res = await this._post(this.URLs.contacts, {
      firstName,
      lastName,
      sourceId,
      sourceType,
      sourceLink,
      email,
      phone,
      companyId,
    });
    return res;
  }

  // Updates and returns a Contact with the provided data
  async updateContact(data) {
    const firstName = get(data, "firstName");
    const lastName = get(data, "lastName");
    const email = get(data, "email");
    const sourceId = get(data, "sourceId", null);
    const sourceType = get(data, "sourceType", null);
    const sourceLink = get(data, "sourceLink", null);
    const phone = get(data, "phone", null);
    const companyId = get(data, "companyId");
    const id = get(data, "id");

    const res = await this._put(this.URLs.contact(id), {
      firstName,
      lastName,
      sourceId,
      sourceType,
      email,
      phone,
      companyId,
      sourceLink,
    });
    return res;
  }

  // Return array of company objects
  async listCompanies() {
    const res = await this._get(this.URLs.companies);
    return res;
  }

  // Creates and returns a Company from the provided data
  async createCompany(data) {
    const name = get(data, "name");
    const website = get(data, "website", null);
    const sourceId = get(data, "sourceId", null);
    const sourceType = get(data, "sourceType", null);
    const address = get(data, "address", null);
    const body = {
      name,
      sourceId,
      sourceType,
      address,
    };
    if (website) body.website = website;

    const res = await this._post(this.URLs.companies, body);
    return res;
  }

  // Updates and returns a Company with the provided data
  async updateCompany(data) {
    const name = get(data, "name");
    const website = get(data, "website", null);
    const sourceId = get(data, "sourceId", null);
    const sourceType = get(data, "sourceType", null);
    const sourceLink = get(data, "sourceLink", null);
    const address = get(data, "address", null);
    const id = get(data, "id");
    const body = {
      name,
      sourceId,
      sourceType,
      address,
      sourceLink,
    };
    if (website) body.website = website;

    const res = await this._put(this.URLs.company(id), body);
    return res;
  }

  // Return array of activity objects
  async listActivities() {
    const res = await this._get(this.URLs.activities);
    return res;
  }

  // Create webhook for a given body. The body will include the topic, which determines when the webhook fires
  async createWebhook(body) {
    const res = await this._post(this.URLs.webhooks, body);
    return res;
  }

  // Create a webhook that will fire whenever a quote is created. Url = webhook url
  async createdQuoteWebhook(webhookUrl) {
    const body = {
      url: webhookUrl,
      topic: this.webhookTopics.createdQuote,
      method: "POST",
    };

    return this.createWebhook(body);
  }

  // Create a webhook that will fire whenever a quote is updated. Url = webhook url
  async updatedQuoteWebhook(webhookUrl) {
    const body = {
      url: webhookUrl,
      topic: this.webhookTopics.updatedQuote,
      method: "POST",
    };
    return this.createWebhook(body);
  }

  // Create a webhook that will fire whenever an activity is created. Url = webhook url
  async quoteActivityWebhook(webhookUrl) {
    const body = {
      url: webhookUrl,
      topic: this.webhookTopics.createdActivity,
      method: "POST",
    };
    return this.createWebhook(body);
  }

  /* Not in Zapier app - return an array of activities for a given quote ID
    async getActivitiesForQuote(quoteId) {
        return this._get(this.URLs.getActivitiesForQuote(quoteId));
    }
    */

  // Delete/unsubscribe from a given webhook id. Returns a 204 status on success/no JSON
  async deleteWebhook(webhookId) {
    const endpoint = `${this.URLs.webhooks}/${webhookId}`;
    const res = await this._delete(endpoint);
    return res;
  }

  // Search for a quote by one of the words in its title. Currently not working in API/postman, returns 404 when it shouldn't
  async findQuote(query) {
    const res = await this._get(this.URLs.findQuote, query);
    return res;
  }

  async getQuoteById(quoteId) {
    const res = await this._get(this.URLs.getQuote(quoteId), {});
    return res;
  }

  async getQuoteHtml(quoteId) {
    const res = await this._getHtml(this.URLs.getQuoteBreakdown(quoteId), {});
    return res;
  }

  async getPublishedQuoteById(publishedQuoteId) {
    const res = await this._get(this.URLs.getPublishedQuote(publishedQuoteId));
    return res;
  }

  async getPublishedQuoteHtml(publishedQuoteId) {
    const res = await this._getHtml(
      this.URLs.getPublishedQuoteBreakdown(publishedQuoteId),
      {}
    );
    return res;
  }

  // Create a new quote with a body that includes the new quotes key/values
  async createQuote(body) {
    const res = await this._post(this.URLs.quotes, body);
    return res;
  }

  // Updates an existing quote via PATCH with a body that includes the quote's key/values to update
  async updateQuote(quoteId, body) {
    const endpoint = `${this.URLs.quotes}/${quoteId}`;
    const res = await this._patch(endpoint, body);
    return res;
  }

  async setClosedWon(quoteId) {
    const res = await this._post(this.URLs.closedWon(quoteId), {});
    return res;
  }

  async setClosedLost(quoteId) {
    const res = await this._post(this.URLs.closedLost(quoteId), {});
    return res;
  }
}

module.exports = Api;
