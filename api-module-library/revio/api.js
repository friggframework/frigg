const { get, Requester } = require('@friggframework/core-rollup');
const fetch = require('node-fetch');
const FormatPatchBody = require('./formatPatchBody');

class Api extends Requester {
    constructor(params) {
        super(params);
        this.USER_NAME = get(params, 'username', null);
        this.CLIENT_CODE = get(params, 'client_code', null);
        this.PASSWORD = get(params, 'password', null);
    }

    async createWebhookReceiver(url) {
        const response = await fetch(
            'https://restapi.rev.io/v1/WebhookReceivers',
            {
                credentials: 'include',
                headers: {
                    Accept: 'application/json',
                    authorization: this.basicAuth(),
                    'content-type': 'text/json',
                },
                body: `{"url":"${url}","description":"ConnectWise Integration"}`,
                method: 'POST',
                mode: 'cors',
            }
        );
        return response.json();
    }

    async deleteWebHookReceiver(id) {
        const options = {
            credentials: 'include',
            mode: 'cors',
            method: 'DELETE',
            headers: {
                accept: 'application/json',
                authorization: this.basicAuth(),
            },
        };
        const response = await fetch(
            `https://restapi.rev.io/v1/WebhookReceivers/${id}`,
            options
        );
        return response.json();
    }

    async activateWebhookReceiver(id) {
        const options = {
            credentials: 'include',
            method: 'POST',
            headers: {
                accept: 'application/json',
                authorization: this.basicAuth(),
            },
        };
        const response = await fetch(
            `https://restapi.rev.io/v1/WebhookReceivers/${id}/activate`,
            options
        );
        return response.json();
    }

    async getWebhookSubscription(id) {
        const options = {
            credentials: 'include',
            method: 'GET',
            headers: {
                accept: 'application/json',
                authorization: this.basicAuth(),
            },
        };
        const response = await fetch(
            `https://restapi.rev.io/v1/WebhookSubscriptions/${id}`,
            options
        );
        return response.json();
    }

    async getWebhookSubscriptions(query) {
        const options = {
            url: 'https://restapi.rev.io/v1/WebhookSubscriptions',
            method: 'GET',
            headers: {
                accept: 'application/json',
                authorization: this.basicAuth(),
            },
        };
        if (query) {
            options.query = query;
        }
        const response = await this._get(options);
        return response;
    }

    async getWebhookReceivers(query) {
        const options = {
            url: 'https://restapi.rev.io/v1/WebhookReceivers',
            method: 'GET',
            headers: {
                accept: 'application/json',
                authorization: this.basicAuth(),
            },
        };
        if (query) {
            options.query = query;
        }
        const response = await this._get(options);
        return response;
    }

    async createWebhookSubscription(event_type, webhook_receiver_id) {
        const response = await fetch(
            'https://restapi.rev.io/v1/WebhookSubscriptions',
            {
                credentials: 'include',
                headers: {
                    Accept: 'application/json',
                    authorization: this.basicAuth(),
                    'content-type': 'text/json',
                },
                body: `{"webhook_receiver_id":${webhook_receiver_id},"event_type":"${event_type}"}`,
                method: 'POST',
                mode: 'cors',
            }
        );
        return response.json();
    }

    async deleteWebhookSubscription(id) {
        const options = {
            credentials: 'include',
            method: 'DELETE',
            headers: {
                accept: 'application/json',
                authorization: this.basicAuth(),
            },
        };
        const response = await fetch(
            `https://restapi.rev.io/v1/WebhookSubscriptions/${id}`,
            options
        );
        return response.json();
    }

    async createContact(contact) {
        const response = await fetch('https://restapi.rev.io/v1/Contacts', {
            credentials: 'include',
            headers: {
                Accept: 'application/json',
                authorization: this.basicAuth(),
                'content-type': 'text/json',
            },
            referrer: 'https://developers.rev.io/reference',
            body: JSON.stringify(contact),
            method: 'POST',
            mode: 'cors',
        });
        return response.json();
    }

    async getContactById(id) {
        const options = {
            method: 'GET',
            headers: {
                accept: 'application/json',
                authorization: this.basicAuth(),
            },
        };
        const responce = await fetch(
            `https://restapi.rev.io/v1/Contacts/${id}`,
            options
        );
        return responce.json();
    }

    async getContacts(query) {
        const options = {
            url: 'https://restapi.rev.io/v1/Contacts',
            method: 'GET',
            headers: {
                accept: 'application/json',
                authorization: this.basicAuth(),
            },
        };
        if (query) {
            options.query = query;
        }
        const response = await this._get(options);
        return response;
    }

    // MOVE TO SOMEWHERE ELSE
    // TODO Also feel free to switch this away from params, although I like the reinforcement
    async getPaymentById(params) {
        const paymentId = get(params, 'id');
        const options = {
            url: `https://restapi.rev.io/v1/Payments/${paymentId}`,
            method: 'POST',
            headers: {
                accept: 'application/json',
                authorization: this.basicAuth(),
                'Content-Type': 'application/json',
            },
        };
        const response = await this._get(options);
        return response;
    }

    async createPayment(params) {
        const customerId = get(params, 'customerId');
        const amount = get(params, 'amount');
        const referenceNumber = get(params, 'referenceNumber');
        const body = {
            customer_id: customerId,
            amount,
            reference_number: referenceNumber,
        };
        const options = {
            url: 'https://restapi.rev.io/v1/Payments',
            method: 'POST',
            headers: {
                accept: 'application/json',
                authorization: this.basicAuth(),
                'Content-Type': 'application/json',
            },
            body,
        };

        const response = await this._post(options);
        return response;
    }

    async deleteContact(id) {
        const options = {
            method: 'DELETE',
            headers: {
                accept: 'application/json',
                authorization: this.basicAuth(),
            },
        };
        const response = await fetch(
            `https://restapi.rev.io/v1/Contacts/${id}`,
            options
        );
        return response.json();
    }

    async patchContact(id, body) {
        const formattedBody = FormatPatchBody('/', body);
        const options = {
            credentials: 'include',
            headers: {
                Accept: 'application/json',
                authorization: this.basicAuth(),
                'content-type': 'application/json-patch+json',
            },
            referrer: 'https://developers.rev.io/reference',
            body: JSON.stringify(formattedBody),
            method: 'PATCH',
            mode: 'cors',
        };
        const response = await fetch(
            `https://restapi.rev.io/v1/Contacts/${id}`,
            options
        );
        return response.json();
    }

    async createCustomer(customer) {
        const options = {
            credentials: 'include',
            method: 'POST',
            headers: {
                Accept: 'application/json',
                authorization: this.basicAuth(),
                'content-type': 'text/json',
            },
            body: JSON.stringify(customer),
            mode: 'cors',
        };
        const response = await fetch(
            'https://restapi.rev.io/v1/Customers',
            options
        );
        return response.json();
    }

    async deleteCustomer(id) {
        const options = {
            method: 'DELETE',
            headers: {
                accept: 'application/json',
                authorization: this.basicAuth(),
            },
        };
        const response = await fetch(
            `https://restapi.rev.io/v1/Customers/${id}`,
            options
        );
        return response.json();
    }

    async getCustomer(id) {
        const options = {
            credentials: 'include',
            method: 'GET',
            headers: {
                accept: 'application/json',
                authorization: this.basicAuth(),
            },
        };
        const response = await fetch(
            `https://restapi.rev.io/v1/Customers/${id}`,
            options
        );
        return response.json();
    }

    async getCustomers(query) {
        const options = {
            url: 'https://restapi.rev.io/v1/Customers',
            credentials: 'include',
            method: 'GET',
            headers: {
                accept: 'application/json',
                authorization: this.basicAuth(),
            },
        };
        if (query) {
            options.query = query;
        }
        return await this._get(options);
    }

    async getBills(query) {
        const options = {
            url: 'https://restapi.rev.io/v1/Bills',
            credentials: 'include',
            method: 'GET',
            headers: {
                accept: 'application/json',
                authorization: this.basicAuth(),
            },
        };
        if (query) {
            options.query = query;
        }
        return await this._get(options);
    }

    async getBillById(id) {
        const options = {
            url: `https://restapi.rev.io/v1/Bills/${id}`,
            credentials: 'include',
            method: 'GET',
            headers: {
                accept: 'application/json',
                authorization: this.basicAuth(),
            },
        };
        return await this._get(options);
    }

    async getCharges(query) {
        const options = {
            url: 'https://restapi.rev.io/v1/Charges',
            credentials: 'include',
            method: 'GET',
            headers: {
                accept: 'application/json',
                authorization: this.basicAuth(),
            },
        };
        if (query) {
            options.query = query;
        }
        return await this._get(options);
    }

    async getBillProfile() {
        const options = {
            credentials: 'include',
            method: 'GET',
            headers: {
                accept: 'application/json',
                authorization: this.basicAuth(),
            },
        };
        const response = await fetch(
            'https://restapi.rev.io/v1/BillProfiles',
            options
        );
        return response.json();
    }

    async patchCustomer(id, body) {
        const formattedBody = FormatPatchBody('/', body);
        const options = {
            credentials: 'include',
            method: 'PATCH',
            headers: {
                accept: 'application/json',
                'content-type': 'application/json-patch+json',
                authorization: this.basicAuth(),
            },
            body: JSON.stringify(formattedBody),
        };
        const response = await fetch(
            `https://restapi.rev.io/v1/Customers/${id}`,
            options
        );
        return response.json();
    }

    basicAuth() {
        const credentials = `${this.USER_NAME}@${this.CLIENT_CODE}:${this.PASSWORD}`;
        const buff = new Buffer.from(credentials);
        const base64Credentials = buff.toString('base64');
        return `Basic ${base64Credentials}`;
    }
}

module.exports = { Api };
