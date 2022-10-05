const { ApiKeyRequester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends ApiKeyRequester {
    constructor(params) {
        super(params);

        this.API_KEY_NAME = 'Bearer';
        this.API_KEY_VALUE = get(params, 'apiKey', null);
        this.baseUrl = 'https://demo.ironcladapp.com';

        this.URLs = {
            webhooks: '/public/api/v1/webhooks',
            webhookByID: (webhookId) => `/public/api/v1/webhooks/${webhookId}`,
            workflows: '/public/api/v1/workflows',
            workflowsByID: (workflowId) => `/public/api/v1/workflows/${workflowId}`,
            workflowSchemas: '/public/api/v1/workflow-schemas',
            workflowSchemaByID: (schemaId) => `/public/api/v1/workflow-schemas/${schemaId}`
        };
    }

    async addAuthHeaders(headers) {
        if (this.API_KEY_VALUE) {
            headers.Authorization = `Bearer ${this.API_KEY_VALUE}`;
        }

        return headers;
    }

    async listWebhooks() {
        const options = {
            url: this.baseUrl + this.URLs.webhooks,
        };
        const response = await this._get(options);
        return response;
    }

    async createWebhook(events, targetURL) {
        const options = {
            url: this.baseUrl + this.URLs.webhooks,
            headers: {
                'content-type': 'application/json',
            },
            body: {
                events,
                targetURL
            }
        };
        const response = await this._post(options);
        return response;
    }

    async updateWebhook(webhookId, events = null, targetURL = null) {
        const options = {
            url: this.baseUrl + this.URLs.webhookByID(webhookId),
            headers: {
                'content-type': 'application/json',
            },
            body: {}
        }

        if (events.length > 0) {
            options.body.events = events;
        }

        if (targetURL) {
            options.body.targetURL = targetURL;
        }

        const response = await this._patch(options);
        return response;

    }
    async deleteWebhook(webhookId) {
        const options = {
            url: this.baseUrl + this.URLs.webhookByID(webhookId)
        }
        const response = await this._delete(options);
        return response;
    }

    async listAllWorkflows() {
        const options = {
            url: this.baseUrl + this.URLs.workflows
        }
        const response = await this._get(options);
        return response;
    }

    async createWorkflow(body) {
        const options = {
            url: this.baseUrl + this.URLs.workflows,
            headers: {
                'content-type': 'application/json'
            },
            body
        }
        const response = await this._post(options);
        return response;
    }

    async listAllWorkflowSchemas(params) {
        const options = {
            url: this.baseUrl + this.URLs.workflowSchemas,
            query: params
        }
        const response = await this._get(options);
        return response;
    }

    async retrieveWorkflowSchema(params, id) {
        const options = {
            url: this.baseUrl + this.URLs.workflowSchemaByID(id),
            query: {
                params
            }
        }
        const response = await this._get(options);
        return response;
    }

    async listAllWorkflowApprovals(id) {
        const options = {
            url: this.baseUrl + this.URLs.workflowsByID(id) + '/approvals',
        }
        const response = await this._get(options);
        return response;
    }
}

module.exports = { Api };
