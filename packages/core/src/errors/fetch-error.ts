import { BaseError } from './base-error';
import { stripIndent } from 'common-tags';

export interface FetchErrorInit {
    method?: string;
    credentials?: string;
    headers?: object;
    query?: object;
    body?: URLSearchParams | unknown;
    returnFullRes?: boolean;
}

export interface FetchErrorResponse {
    headers?: Iterable<[string, string]>;
    status?: number;
    statusText?: string;
    text?: () => Promise<string>;
    bodyUsed?: boolean;
}

export interface FetchErrorOptions {
    resource?: string;
    init?: FetchErrorInit;
    response?: FetchErrorResponse;
    responseBody?: unknown;
    body?: unknown;
}

export class FetchError extends BaseError {
    response: FetchErrorResponse | null = null;
    statusCode: number | undefined;

    constructor(options: FetchErrorOptions = {}) {
        const { resource, init, response, responseBody } = options;
        const method = init?.method ?? 'GET';
        const initText = init
            ? init.body instanceof URLSearchParams
                ? (() => {
                      (init as { body: unknown }).body = (init.body as URLSearchParams).toString();
                      return JSON.stringify({ init }, null, 2);
                  })()
                : JSON.stringify({ init }, null, 2)
            : '';

        let responseBodyText: string = '<response body is unavailable>';
        if (typeof responseBody === 'string') {
            responseBodyText = responseBody;
        } else if (responseBody) {
            responseBodyText = JSON.stringify(responseBody, null, 2);
        }

        const responseHeaders: Record<string, string> = {};
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

        this.response = response ?? null;
        this.statusCode = response?.status;
    }

    static async create(options: FetchErrorOptions = {}): Promise<FetchError> {
        const { response } = options;
        let responseBody: string | null | undefined = response?.bodyUsed ? null : await response?.text?.();
        if (!responseBody && options.body) responseBody = options.body as string;
        return new FetchError({ ...options, responseBody });
    }
}
