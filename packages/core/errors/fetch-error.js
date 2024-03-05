const { BaseError } = require('./base-error');
const { stripIndent } = require('common-tags');

// TODO hide header values

// Parameters names here are based on fetch.  See:
// https://developer.mozilla.org/en-US/docs/Web/API/fetch

class FetchError extends BaseError {
    response = null;

    constructor(options = {}) {
        const { resource, init, response, responseBody } = options;
        const method = init?.method ?? 'GET';
        const initText = init
            ? init.body instanceof URLSearchParams
                ? (() => {
                      init.body = init.body.toString();
                      return JSON.stringify({ init }, null, 2);
                  })()
                : JSON.stringify({ init }, null, 2)
            : '';        

        let responseBodyText = '<response body is unavailable>';
        if (typeof responseBody === 'string') {
            responseBodyText = responseBody;
        } else if (responseBody) {
            responseBodyText = JSON.stringify(responseBody, null, 2);
        }

        const responseHeaders = {};
        if (response?.headers) {
            for (const [key, value] of response.headers) {
                responseHeaders[key] = value;
            }
        }

        const responseHeaderText = response
            ? JSON.stringify({ headers: responseHeaders }, null, 2)
            : '';

        const messageParts = [
            stripIndent`
                -----------------------------------------------------
                An error ocurred while fetching an external resource.
                -----------------------------------------------------
                >>> Request Details >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
                ${method} ${resource}
            `,
            initText,
            stripIndent`
                <<< Response Details <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
                ${response?.status} ${response?.statusText}
            `,
            responseHeaderText,
            responseBodyText,
            stripIndent`
                -----------------------------------------------------
                Stack Trace:
            `,
        ];

        super(messageParts.filter(Boolean).join('\n'));
        
        this.response = response;
    }

    static async create(options = {}) {
        const { response } = options;
        let responseBody = response?.bodyUsed ? null : await response?.text();
        if (!responseBody && options.body) responseBody = options.body;
        return new FetchError({ ...options, responseBody });
    }
}

module.exports = { FetchError };
