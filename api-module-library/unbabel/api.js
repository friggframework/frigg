const { OAuth2Requester, get } = require('@friggframework/core-rollup');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.customer_id = get(params, 'customer_id', null);
        this.baseUrl = `https://api.unbabel.com`;

        this.URLs = {
            pipelines: {
                fetch: () => `${this.baseUrl}/pipelines/v0/customers/${this.customer_id}/pipelines`,
            },
            translations: {
                fetch: (uid) => `${this.baseUrl}/translation/v1/customers/${this.customer_id}/translations/${uid}`,
                submit: () => `${this.baseUrl}/translation/v1/customers/${this.customer_id}/translations:submit_async`,
                search: () => `${this.baseUrl}/translation/v1/customers/${this.customer_id}/translations:search`,
                cancel: (uid) => `${this.baseUrl}/translation/v1/customers/${this.customer_id}/translations/${uid}:cancel`
            }
        };
        this.tokenUri = 'https://iam.unbabel.com/auth/realms/production/protocol/openid-connect/token';
    }

    setCustomerId(customer_id){
        this.customer_id = customer_id;
    }
    async getTokenFromUsernamePassword() {
        try {
            const form = new URLSearchParams();
            form.append('grant_type', 'password');
            form.append('client_id', this.client_id);
            form.append('username', this.username);
            form.append('password', this.password);
            const options = {
                body: form,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                url: this.tokenUri
            };

            const response = await this._post(options, false);

            await this.setTokens(response);
            return response;
        } catch (err) {
            await this.notify(this.DLGT_INVALID_AUTH);
        }
    }

    async getTranslation(id) {
        console.log('getting translation', id)
        const options = {
            url: this.URLs.translations.fetch(id),
        };
        const res = await this._get(options);
        console.log('got translation', res)
        return res;
    }


    async searchTranslations(body){
        const options = {
            url: this.URLs.translations.search(),
            headers: {
                'Content-Type': 'application/json',
            },
            body
        };
        const res = await this._post(options);
        return res;
    }

    async submitTranslation(body, callbackUrl){
        const options = {
            url: this.URLs.translations.submit(),
            headers: {
                'Content-Type': 'application/json',
            },
            body
        };
        if (callbackUrl) {
            options.headers.Link = [`${callbackUrl}; rel="delivery-callback`];
        }
        const res = await this._post(options);
        return res;
    }

    async cancelTranslation(id){
        const options = {
            url: this.URLs.translations.cancel(id),
        };
        const res = await this._post(options);
        return res;
    }

    async listPipelines() {
        const options = {
            url: this.URLs.pipelines.fetch(),
        }
        const response = await this._get(options);
        return response;
    }
}

module.exports = { Api };
