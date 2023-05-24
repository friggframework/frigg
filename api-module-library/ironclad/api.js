const { ApiKeyRequester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');
const https = require('https');

class Api extends ApiKeyRequester {
    constructor(params) {
        super(params);

        this.API_KEY_NAME = 'Bearer';
        this.API_KEY_VALUE = get(params, 'apiKey', null);
        this.SUBDOMAIN = get(params, 'subdomain', null);
        this.IS_LOCAL = this.SUBDOMAIN?.toLowerCase() === 'localhost' ? true : false;
        this.HTTPS_AGENT = this.IS_LOCAL ? new https.Agent({
            rejectUnauthorized: false,
        }) : undefined;

        this.baseUrl = () => {
            if (this.SUBDOMAIN) {
                const subdomain = this.SUBDOMAIN.toLowerCase();
                return `https://${this.IS_LOCAL ? '127.0.0.1' : subdomain}${!this.IS_LOCAL ? '.ironcladapp.com' : ''}`;
            } else {
                return 'https://ironcladapp.com';
            }
        };

        this.URLs = {
            me: '/public/api/v1/me',
            webhooks: '/public/api/v1/webhooks',
            webhookByID: (webhookId) => `/public/api/v1/webhooks/${webhookId}`,
            workflows: '/public/api/v1/workflows',
            workflowsByID: (workflowId) =>
                `/public/api/v1/workflows/${workflowId}`,
            workflowSchemas: '/public/api/v1/workflow-schemas',
            workflowSchemaByID: (schemaId) =>
                `/public/api/v1/workflow-schemas/${schemaId}`,
            workflowMetadata: (workflowId) =>
                `/public/api/v1/workflows/${workflowId}/attributes`,
            workflowComment: (workflowId) =>
                `/public/api/v1/workflows/${workflowId}/comments`,
            workflowCommentByID: (workflowId, commentId) =>
                `/public/api/v1/workflows/${workflowId}/comments/${commentId}`,
            records: '/public/api/v1/records',
            recordByID: (recordId) => `/public/api/v1/records/${recordId}`,
            recordSchemas: '/public/api/v1/records/metadata',
            workflowParticipantsByID: (workflowId) =>
                `/public/api/v1/workflows/${workflowId}/participants`,
            userByID: (userId) => `/scim/v2/Users/${userId}`,
        };
    }

    async addAuthHeaders(headers) {
        if (this.API_KEY_VALUE) {
            headers.Authorization = `Bearer ${this.API_KEY_VALUE}`;
        }
        return headers;
    }

    async getConnectionInformation() {
        const options = {
            url: this.baseUrl() + this.URLs.me,
            agent: this.HTTPS_AGENT,
        };
        const response = await this._get(options);
        return response;
    }

    async listWebhooks() {
        const options = {
            url: this.baseUrl() + this.URLs.webhooks,
            agent: this.HTTPS_AGENT,
        };
        const response = await this._get(options);
        return response;
    }

    async createWebhook(events, targetURL) {
        const options = {
            url: this.baseUrl() + this.URLs.webhooks,
            headers: {
                'content-type': 'application/json',
            },
            body: {
                events,
                targetURL,
            },
            agent: this.HTTPS_AGENT,
        };
        const response = await this._post(options);
        return response;
    }

    async updateWebhook(webhookId, events = null, targetURL = null) {
        const options = {
            url: this.baseUrl() + this.URLs.webhookByID(webhookId),
            headers: {
                'content-type': 'application/json',
            },
            body: {},
            agent: this.HTTPS_AGENT,
        };

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
            url: this.baseUrl() + this.URLs.webhookByID(webhookId),
            agent: this.HTTPS_AGENT,
        };
        const response = await this._delete(options);
        return response;
    }

    async listAllWorkflows(params) {
        const options = {
            url: this.baseUrl() + this.URLs.workflows,
            query: params,
            agent: this.HTTPS_AGENT,
        };
        const response = await this._get(options);
        return response;
    }

    async retrieveWorkflow(id) {
        const options = {
            url: this.baseUrl() + this.URLs.workflowsByID(id),
            agent: this.HTTPS_AGENT,
        };
        const response = await this._get(options);
        return response;
    }

    async createWorkflow(body) {
        const options = {
            url: this.baseUrl() + this.URLs.workflows,
            headers: {
                'content-type': 'application/json',
            },
            body,
            agent: this.HTTPS_AGENT,
        };
        const response = await this._post(options);
        return response;
    }

    async listAllWorkflowSchemas(params, asUserEmail, asUserId) {
        const options = {
            url: this.baseUrl() + this.URLs.workflowSchemas,
            query: params,
            headers: {},
            agent: this.HTTPS_AGENT,
        };
        if (asUserEmail) {
            options.headers['x-as-user-email'] = asUserEmail;
        }
        if (asUserId) {
            options.headers['x-as-user-id'] = asUserId;
        }
        const response = await this._get(options);
        return response;
    }

    async retrieveWorkflowSchema(params, id) {
        const options = {
            url: this.baseUrl() + this.URLs.workflowSchemaByID(id),
            query: params,
            agent: this.HTTPS_AGENT,
        };
        const response = await this._get(options);
        return response;
    }

    async listAllWorkflowApprovals(id) {
        const options = {
            url: this.baseUrl() + this.URLs.workflowsByID(id) + '/approvals',
            agent: this.HTTPS_AGENT,
        };
        const response = await this._get(options);
        return response;
    }
    async listAllWorkflowSignatures(id) {
        const options = {
            url: this.baseUrl() + this.URLs.workflowsByID(id) + '/signatures',
            agent: this.HTTPS_AGENT,
        };
        const response = await this._get(options);
        return response;
    }

    async updateWorkflowApprovals(id, roleID, body) {
        const options = {
            url:
                this.baseUrl() +
                this.URLs.workflowsByID(id) +
                '/approvals/' +
                roleID,
            headers: {
                'content-type': 'application/json',
            },
            body,
            agent: this.HTTPS_AGENT,
        };
        const response = await this._patch(options);
        return response;
    }

    async revertWorkflowToReviewStep(id, body) {
        const options = {
            url:
                this.baseUrl() +
                this.URLs.workflowsByID(id) +
                '/revert-to-review',
            headers: {
                'content-type': 'application/json',
            },
            body,
            agent: this.HTTPS_AGENT,
        };
        const response = await this._patch(options);
        return response;
    }

    async createWorkflowComment(id, body) {
        const options = {
            url: this.baseUrl() + this.URLs.workflowComment(id),
            headers: {
                'content-type': 'application/json',
            },
            body,
            agent: this.HTTPS_AGENT,
        };
        const response = await this._post(options);
        return response;
    }

    async getWorkflowComment(workflowId, commentId) {
        const options = {
            url:
                this.baseUrl() +
                this.URLs.workflowCommentByID(workflowId, commentId),
            headers: {
                'content-type': 'application/json',
            },
            agent: this.HTTPS_AGENT,
        };
        const response = await this._get(options);
        return response;
    }

    async retrieveWorkflowDocument(workflowID, documentKey) {
        const options = {
            url:
                this.baseUrl() +
                this.URLs.workflowsByID(workflowID) +
                `/document/${documentKey}/download`,
            agent: this.HTTPS_AGENT,
        };
        const response = await this._get(options);
        return response;
    }

    async updateWorkflow(id, body) {
        const options = {
            url: this.baseUrl() + this.URLs.workflowMetadata(id),
            headers: {
                'content-type': 'application/json',
            },
            body,
            agent: this.HTTPS_AGENT,
        };
        const response = await this._patch(options);
        return response;
    }

    async listAllRecords() {
        const options = {
            url: this.baseUrl() + this.URLs.records,
            agent: this.HTTPS_AGENT,
        };
        const response = await this._get(options);
        return response;
    }

    async createRecord(body) {
        const options = {
            url: this.baseUrl() + this.URLs.records,
            headers: {
                'content-type': 'application/json',
            },
            body,
            agent: this.HTTPS_AGENT,
        };
        const response = await this._post(options);
        return response;
    }

    async listAllRecordSchemas() {
        const options = {
            url: this.baseUrl() + this.URLs.recordSchemas,
            agent: this.HTTPS_AGENT,
        };
        const response = await this._get(options);
        return response;
    }

    async retrieveRecord(recordId) {
        const options = {
            url: this.baseUrl() + this.URLs.recordByID(recordId),
            agent: this.HTTPS_AGENT,
        };
        const response = await this._get(options);
        return response;
    }

    async updateRecord(recordId, body) {
        const options = {
            url: this.baseUrl() + this.URLs.recordByID(recordId),
            headers: {
                'content-type': 'application/json',
            },
            body,
            agent: this.HTTPS_AGENT,
        };
        const response = await this._patch(options);
        return response;
    }

    async deleteRecord(recordId) {
        const options = {
            url: this.baseUrl() + this.URLs.recordByID(recordId),
            agent: this.HTTPS_AGENT,
        };
        const response = await this._delete(options);
        return response;
    }

    async getWorkflowParticipants(workflowId) {
        // TODO: Handle pagination for this api call
        const options = {
            url:
                this.baseUrl() + this.URLs.workflowParticipantsByID(workflowId),
            agent: this.HTTPS_AGENT,
        };
        const response = await this._get(options);
        return response;
    }

    async getUser(userId) {
        const options = {
            url: this.baseUrl() + this.URLs.userByID(userId),
            agent: this.HTTPS_AGENT,
        };
        const response = await this._get(options);
        return response;
    }
}

module.exports = { Api };
