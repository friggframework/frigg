const OAuth2Base = require("@friggframework/core/auth/OAuth2Base");
const { get } = require("@friggframework/assertions");

class Api extends OAuth2Base {
  constructor(params) {
    super(params);
    this.baseUrl = "https://api.hubapi.com";

    this.client_id = process.env.HUBSPOT_CLIENT_ID;
    this.client_secret = process.env.HUBSPOT_CLIENT_SECRET;
    this.redirect_uri = `${process.env.REDIRECT_URI}/hubspot`;
    this.scopes = process.env.HUBSPOT_SCOPES;

    this.URLs = {
      authorization: "/oauth/authorize",
      access_token: "/oauth/v1/token",
      contacts: "/crm/v3/objects/contacts",
      contactById: (contactId) => `/crm/v3/objects/contacts/${contactId}`,
      getBatchContactsById: "/crm/v3/objects/contacts/batch/read",
      companies: "/crm/v3/objects/companies",
      companyById: (compId) => `/crm/v3/objects/companies/${compId}`,
      getBatchCompaniesById: "/crm/v3/objects/companies/batch/read",
      createTimelineEvent: "/crm/v3/timeline/events",
      userDetails: "/integrations/v1/me",
      domain: (accessToken) => `/oauth/v1/access-tokens/${accessToken}`,
      properties: (objType) => `/crm/v3/properties/${objType}`,
      propertiesByName: (objType, propName) =>
        `/crm/v3/properties/${objType}/${propName}`,
      deals: "/crm/v3/objects/deals",
      dealById: (dealId) => `/crm/v3/objects/deals/${dealId}`,
      searchDeals: "/crm/v3/objects/deals/search",
      getBatchAssociations: (fromObject, toObject) =>
        `/crm/v3/associations/${fromObject}/${toObject}/batch/read`,
      v1DealInfo: (dealId) => `/deals/v1/deal/${dealId}`,
      getPipelineDetails: (objType) => `/crm/v3/pipelines/${objType}`,
      getOwnerById: (ownerId) => `/owners/v2/owners/${ownerId}`,
      contactList: "/contacts/v1/lists",
      contactListById: (listId) => `/contacts/v1/lists/${listId}`,
      customObjectSchemas: "/crm/v3/schemas",
      customObjectSchemaByObjectType: (objectType) =>
        `/crm/v3/schemas/${objectType}`,
      customObjects: (objectType) => `/crm/v3/objects/${objectType}`,
      customObjectById: (objectType, objId) =>
        `/crm/v3/objects/${objectType}/${objId}`,
      bulkCreateCustomObjects: (objectType) =>
        `/crm/v3/objects/${objectType}/batch/create`,
      bulkArchiveCustomObjects: (objectType) =>
        `/crm/v3/objects/${objectType}/batch/archive`,
    };

    this.authorizationUri = encodeURI(
      `https://app.hubspot.com/oauth/authorize?client_id=${this.client_id}&redirect_uri=${this.redirect_uri}&scope=${this.scopes}&state=app:HUBSPOT`
    );
    this.tokenUri = "https://api.hubapi.com/oauth/v1/token";

    this.access_token = get(params, "access_token", null);
    this.refresh_token = get(params, "refresh_token", null);
    this.api_key = get(params, "api_key", null);
  }

  async setAccessToken(accessToken) {
    this.access_token = accessToken;
  }

  async refreshRetry(callback) {
    await this.refreshAccessToken();
    return callback();
  }

  async getAuthUri() {
    return this.authorizationUri;
  }

  // **************************   Companies   **********************************

  async createCompany(body) {
    const options = {
      url: this.baseUrl + this.URLs.companies,
      body: {
        properties: body,
      },
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };

    return this._post(options);
  }

  // Docs described endpoint as archive company instead of delete. Will have to make due.
  async archiveCompany(compId) {
    const options = {
      url: this.baseUrl + this.URLs.companyById(compId),
    };

    return this._delete(options);
  }

  async getCompanyById(compId) {
    const props = await this.listProperties("company");
    let propsString = "";
    for (let i = 0; i < props.results.length; i++) {
      propsString += `${props.results[i].name},`;
    }
    propsString = propsString.slice(0, propsString.length - 1);
    const options = {
      url: this.baseUrl + this.URLs.companyById(compId),
      query: {
        properties: propsString,
        associations: "contacts",
      },
    };

    return this._get(options);
  }

  async batchGetCompaniesById(params) {
    // inputs.length should be < 100
    const inputs = get(params, "inputs");
    const properties = get(params, "properties", []);

    const body = {
      inputs,
      properties,
    };
    const options = {
      url: this.baseUrl + this.URLs.getBatchCompaniesById,
      body,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      query: {
        archived: "false",
      },
    };
    return this._post(options);
  }

  // **************************   Contacts   **********************************

  async createContact(body) {
    const options = {
      url: this.baseUrl + this.URLs.contacts,
      body: {
        properties: body,
      },
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };

    return this._post(options);
  }

  async listContacts() {
    const options = {
      url: this.baseUrl + this.URLs.contacts,
    };

    return this._get(options);
  }

  async archiveContact(id) {
    const options = {
      url: this.baseUrl + this.URLs.contactById(id),
    };

    return this._delete(options);
  }

  async getContactById(contactId) {
    const props = await this.listProperties("contact");
    let propsString = "";
    for (let i = 0; i < props.results.length; i++) {
      propsString += `${props.results[i].name},`;
    }
    propsString = propsString.slice(0, propsString.length - 1);
    const options = {
      url: this.baseUrl + this.URLs.contactById(contactId),
      query: {
        properties: propsString,
      },
    };

    return this._get(options);
  }

  async batchGetContactsById(body) {
    // const props = await this.listProperties('contact');
    // const properties = props.results.map((prop) => prop.name);
    /* Example Contacts:
        [{id: 1}] */
    /* Example properties:
        [''] */

    const options = {
      url: this.baseUrl + this.URLs.getBatchContactsById,
      body,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      query: {
        archived: "false",
      },
    };
    return this._post(options);
  }

  // **************************   Deals   **********************************

  async createDeal(body) {
    const options = {
      url: this.baseUrl + this.URLs.deals,
      body: {
        properties: body,
      },
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };

    return this._post(options);
  }

  async archiveDeal(dealId) {
    const options = {
      url: this.baseUrl + this.URLs.dealById(dealId),
    };

    return this._delete(options);
  }

  async getDealById(dealId) {
    const props = await this.listProperties("deal");
    let propsString = "";
    for (let i = 0; i < props.results.length; i++) {
      propsString += `${props.results[i].name},`;
    }
    propsString = propsString.slice(0, propsString.length - 1);
    const options = {
      url: this.baseUrl + this.URLs.dealById(dealId),
      query: {
        properties: propsString,
        associations: "contacts,company",
      },
    };
    return this._get(options);
  }

  async getDealStageHistory(dealId) {
    const options = {
      url: this.baseUrl + this.URLs.v1DealInfo(dealId),
      query: { includePropertyVersions: true },
    };
    const res = await this._get(options);
    return res.properties.dealstage.versions;
  }

  // pageObj can look something like this:
  // { limit: 10, after: 10 }
  async listDeals(pageObj) {
    const props = await this.listProperties("deal");
    let propsString = "";
    for (let i = 0; i < props.results.length; i++) {
      propsString += `${props.results[i].name},`;
    }
    propsString = propsString.slice(0, propsString.length - 1);
    const options = {
      url: this.baseUrl + this.URLs.deals,
      query: {
        properties: propsString,
        associations: "contacts,companies",
      },
    };
    if (pageObj) {
      Object.assign(options.query, pageObj);
    }
    return this._get(options);
  }

  async searchDeals(params) {
    const allProps = get(params, "allProps", true);
    const propsArray = get(params, "props", []);
    const limit = get(params, "limit", 10);
    const after = get(params, "after", 0);
    const filterGroups = get(params, "filterGroups", []);
    const sorts = get(params, "sorts", []);

    if (allProps && propsArray.length === 0) {
      const dealProps = await this.listProperties("deal");
      for (const prop of dealProps.results) {
        propsArray.push(prop.name);
      }
    }

    const searchBody = {
      filterGroups,
      sorts,
      after,
      properties: propsArray,
      limit,
    };

    const options = {
      url: this.baseUrl + this.URLs.searchDeals,
      body: searchBody,
      headers: {
        "content-type": "application/json",
      },
    };
    return this._post(options);
  }

  async updateDeal(params) {
    const dealId = get(params, "dealId");
    const properties = get(params, "properties");
    const body = { properties };
    const options = {
      url: this.baseUrl + this.URLs.getDealById(dealId),
      body,
    };
    return this._patch(options);
  }

  // **************************   Contact Lists *****************************

  async createContactList(body) {
    const options = {
      url: this.baseUrl + this.URLs.contactList,
      body,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };

    return this._post(options);
  }

  async deleteContactList(listId) {
    const options = {
      url: this.baseUrl + this.URLs.contactListById(listId),
    };

    return this._delete(options);
  }

  async getContactListById(listId) {
    const options = {
      url: this.baseUrl + this.URLs.contactListById(listId),
    };

    return this._get(options);
  }

  async listContactLists() {
    const options = {
      url: this.baseUrl + this.URLs.contactList,
    };

    return this._get(options);
  }

  async updateContactList(listId, body) {
    const options = {
      url: this.baseUrl + this.URLs.contactListById(listId),
      body,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };
    return this._post(options);
  }

  //* **************************   Custom Object Schemas   ******************* */

  async createCustomObjectSchema(body) {
    const options = {
      url: this.baseUrl + this.URLs.customObjectSchemas,
      body,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };
    if (this.api_key) {
      options.query = { hapikey: this.api_key };
    }

    return this._post(options);
  }

  async deleteCustomObjectSchema(objectType, hardDelete) {
    // This is a hard delete. Softer would be without query
    // Either way, this can only be done after all records of the objectType are deleted.
    const options = {
      url: this.baseUrl + this.URLs.customObjectSchemaByObjectType(objectType),
      query: {},
    };

    if (this.api_key) {
      options.query.hapikey = this.api_key;
    }
    if (hardDelete) {
      options.query.archived = true;
    }

    return this._delete(options);
  }

  async getCustomObjectSchema(objectType) {
    const options = {
      url: this.baseUrl + this.URLs.customObjectSchemaByObjectType(objectType),
    };

    if (this.api_key) {
      options.query = { hapikey: this.api_key };
    }

    return this._get(options);
  }

  async listCustomObjectSchemas() {
    const options = {
      url: this.baseUrl + this.URLs.customObjectSchemas,
    };

    if (this.api_key) {
      options.query = { hapikey: this.api_key };
    }

    return this._get(options);
  }

  async updateCustomObjectSchema(objectType, body) {
    const options = {
      url: this.baseUrl + this.URLs.customObjectSchemaByObjectType(objectType),
      body,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };

    if (this.api_key) {
      options.query = { hapikey: this.api_key };
    }

    return this._patch(options);
  }

  //* **************************   Custom Object   *************************** */

  async createCustomObject(objectType, body) {
    const options = {
      url: this.baseUrl + this.URLs.customObjects(objectType),
      body,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };
    if (this.api_key) {
      options.query = { hapikey: this.api_key };
    }

    return this._post(options);
  }

  async bulkCreateCustomObjects(objectType, body) {
    const options = {
      url: this.baseUrl + this.URLs.bulkCreateCustomObjects(objectType),
      body,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };
    if (this.api_key) {
      options.query = { hapikey: this.api_key };
    }

    return this._post(options);
  }

  async deleteCustomObject(objectType, objId) {
    const options = {
      url: this.baseUrl + this.URLs.customObjectById(objectType, objId),
      query: {},
    };

    if (this.api_key) {
      options.query.hapikey = this.api_key;
    }

    return this._delete(options);
  }

  async bulkArchiveCustomObjects(objectType, body) {
    const url = this.baseUrl + this.URLs.bulkArchiveCustomObjects(objectType);
    const options = {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      query: {},
    };

    if (this.api_key) {
      options.query.hapikey = this.api_key;
    }

    // Using _request because it's a post request that returns an empty body
    return this._request(url, options);
  }

  async getCustomObject(objectType, objId) {
    const options = {
      url: this.baseUrl + this.URLs.customObjectById(objectType, objId),
    };

    if (this.api_key) {
      options.query = { hapikey: this.api_key };
    }

    return this._get(options);
  }

  async listCustomObjects(objectType, query = {}) {
    const options = {
      url: this.baseUrl + this.URLs.customObjects(objectType),
      query,
    };

    if (this.api_key) {
      options.query.hapikey = this.api_key;
    }

    return this._get(options);
  }

  async updateCustomObject(objectType, objId, body) {
    const options = {
      url: this.baseUrl + this.URLs.customObjectById(objectType, objId),
      body,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };

    if (this.api_key) {
      options.query = { hapikey: this.api_key };
    }

    return this._patch(options);
  }

  // **************************   Properties / Custom Fields   **********************************

  // Same as below, but kept for legacy purposes. IE, don't break anything if we update module in projects
  async getProperties(objType) {
    return this.listProperties(objType);
  }

  // This better fits naming conventions
  async listProperties(objType) {
    return this._get({
      url: `${this.baseUrl}${this.URLs.properties(objType)}`,
    });
  }

  async createProperty(objType, body) {
    const options = {
      url: this.baseUrl + this.URLs.properties(objType),
      body,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };

    return this._post(options);
  }

  async deleteProperty(objType, propName) {
    const options = {
      url: this.baseUrl + this.URLs.propertiesByName(objType, propName),
    };

    return this._delete(options);
  }

  async getPropertyByName(objType, propName) {
    const options = {
      url: this.baseUrl + this.URLs.propertiesByName(objType, propName),
    };

    return this._get(options);
  }

  async updateProperty(objType, propName, body) {
    const options = {
      url: this.baseUrl + this.URLs.propertiesByName(objType, propName),
      body,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };
    return this._patch(options);
  }

  // **************************   Owners   **********************************

  async getOwnerById(ownerId) {
    // const props = await this.listProperties('owner');
    // let propsString = '';
    // for (let i = 0; i < props.results.length; i++) {
    //     propsString += `${props.results[i].name},`;
    // }
    // propsString = propsString.slice(0, propsString.length - 1);
    const options = {
      url: this.baseUrl + this.URLs.getOwnerById(ownerId),
    };
    return this._get(options);
  }

  // **************************   Timeline Events   **********************************

  async createTimelineEvent(
    objId,
    data,
    eventTemplateId = process.env.HUBSPOT_TIMELINE_EVENT_TEMPLATE_ID
  ) {
    /*
        Example data:
        {
          "activityName": "Custom property for deal"
        }
         */
    const body = {
      eventTemplateId,
      objectId: objId,
      tokens: data.tokens,
      extraData: data.extraData,
    };
    return this._post(this.URLs.createTimelineEvent, body);
  }

  // **************************   Other/All   **********************************

  async getUserDetails() {
    const res1 = await this._get({
      url: this.baseUrl + this.URLs.userDetails,
    });
    const url2 = this.URLs.domain(this.access_token);
    const res2 = await this._get({ url: this.baseUrl + url2 });
    return Object.assign(res1, res2);
  }

  async getPipelineDetails(objType) {
    const options = {
      url: this.baseUrl + this.URLs.getPipelineDetails(objType),
    };
    return this._get(options);
  }

  async batchGetAssociations(params) {
    const fromObject = get(params, "fromObject");
    const toObject = get(params, "toObject");
    const inputs = get(params, "inputs");

    const postBody = { inputs };

    const options = {
      url: this.baseUrl + this.URLs.getBatchAssociations(fromObject, toObject),
      body: postBody,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
    };

    const res = await this._post(options);
    const { results } = res;
    return results;
  }
}

module.exports = Api;
