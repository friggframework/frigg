import fetch from 'node-fetch';
import type { Response, RequestInit } from 'node-fetch';
import type { Agent } from 'node:http';
import { Delegate } from '../../core/Delegate';
import type { DelegateParams } from '../../core/Delegate';
import { FetchError } from '../../errors';
import { get } from '../../assertions';

export interface RequestOptions {
    url: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    returnFullRes?: boolean;
    body?: unknown;
}

interface FetchOptions extends RequestInit {
    query?: Record<string, string>;
    returnFullRes?: boolean;
    credentials?: string;
    headers: Record<string, string>;
}

export interface RequesterParams extends DelegateParams {
    backOff?: number[];
    agent?: Agent | null;
    fetch?: typeof fetch;
}

export class Requester extends Delegate {
    backOff: number[];
    isRefreshable: boolean;
    refreshCount: number;
    DLGT_INVALID_AUTH: string;
    agent: Agent | null;
    fetch: typeof fetch;

    constructor(params: RequesterParams) {
        super(params);
        this.backOff = get(params, 'backOff', [1, 3, 10, 30, 60, 180]) as number[];
        this.isRefreshable = false;
        this.refreshCount = 0;
        this.DLGT_INVALID_AUTH = 'INVALID_AUTH';
        this.delegateTypes.push(this.DLGT_INVALID_AUTH);
        this.agent = get(params, 'agent', null) as Agent | null;
        this.fetch = get(params, 'fetch', fetch) as typeof fetch;
    }

    parsedBody = async (resp: Response): Promise<unknown> => {
        const contentType = resp.headers.get('Content-Type') || '';

        if (
            /^application\/json/.exec(contentType) ||
            /^application\/vnd.api\+json/.exec(contentType) ||
            /^application\/hal\+json/.exec(contentType)
        ) {
            return resp.json();
        }

        return resp.text();
    };

    private buildEncodedUrl(url: string, query?: Record<string, string>): string {
        let encodedUrl = encodeURI(url);
        if (!query) return encodedUrl;

        let queryBuild = '?';
        for (const key in query) {
            queryBuild += `${encodeURIComponent(key)}=${encodeURIComponent(query[key])}&`;
        }
        return encodedUrl + queryBuild.slice(0, -1);
    }

    private async handleRetryableStatus(
        status: number,
        url: string,
        options: FetchOptions,
        i: number
    ): Promise<unknown | null> {
        if ((status === 429 || status >= 500) && i < this.backOff.length) {
            const delay = this.backOff[i] * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
            return this._request(url, options, i + 1);
        }
        return null;
    }

    private async handleUnauthorized(url: string, options: FetchOptions, i: number): Promise<unknown | null> {
        if (this.isRefreshable && this.refreshCount === 0) {
            this.refreshCount++;
            const refreshSucceeded = await this.refreshAuth();
            if (refreshSucceeded) {
                return this._request(url, options, i + 1);
            }
        } else {
            await this.notify(this.DLGT_INVALID_AUTH);
        }
        return null;
    }

    async _request(url: string, options: FetchOptions, i = 0): Promise<unknown> {
        const encodedUrl = this.buildEncodedUrl(url, options.query);

        options.headers = await this.addAuthHeaders(options.headers);

        if (this.agent) (options as unknown as Record<string, unknown>).agent = this.agent;

        let response: Response;
        try {
            response = await this.fetch(encodedUrl, options);
        } catch (e: unknown) {
            if ((e as NodeJS.ErrnoException).code === 'ECONNRESET' && i < this.backOff.length) {
                const delay = this.backOff[i] * 1000;
                await new Promise((resolve) => setTimeout(resolve, delay));
                return this._request(url, options, i + 1);
            }
            throw await FetchError.create({
                resource: encodedUrl,
                init: options,
                responseBody: e,
            });
        }
        const { status } = response;

        const retryResult = await this.handleRetryableStatus(status, url, options, i);
        if (retryResult !== null) return retryResult;

        if (status === 401) {
            const authResult = await this.handleUnauthorized(url, options, i);
            if (authResult !== null) return authResult;
        }

        if (status >= 400) {
            throw await FetchError.create({
                resource: encodedUrl,
                init: options,
                response,
            });
        }

        return options.returnFullRes
            ? response
            : await this.parsedBody(response);
    }

    async _get(options: RequestOptions): Promise<unknown> {
        const fetchOptions: FetchOptions = {
            method: 'GET',
            credentials: 'include',
            headers: options.headers || {},
            query: options.query || {},
            returnFullRes: options.returnFullRes || false,
        };

        return this._request(options.url, fetchOptions);
    }

    async _post(options: RequestOptions, stringify = true): Promise<unknown> {
        const fetchOptions: FetchOptions = {
            method: 'POST',
            credentials: 'include',
            headers: options.headers || {},
            query: options.query || {},
            body: stringify ? JSON.stringify(options.body) : options.body as string,
            returnFullRes: options.returnFullRes || false,
        };
        return this._request(options.url, fetchOptions);
    }

    async _patch(options: RequestOptions, stringify = true): Promise<unknown> {
        const fetchOptions: FetchOptions = {
            method: 'PATCH',
            credentials: 'include',
            headers: options.headers || {},
            query: options.query || {},
            body: stringify ? JSON.stringify(options.body) : options.body as string,
            returnFullRes: options.returnFullRes || false,
        };
        return this._request(options.url, fetchOptions);
    }

    async _put(options: RequestOptions, stringify = true): Promise<unknown> {
        const fetchOptions: FetchOptions = {
            method: 'PUT',
            credentials: 'include',
            headers: options.headers || {},
            query: options.query || {},
            body: stringify ? JSON.stringify(options.body) : options.body as string,
            returnFullRes: options.returnFullRes || false,
        };
        return this._request(options.url, fetchOptions);
    }

    async _delete(options: RequestOptions): Promise<unknown> {
        const fetchOptions: FetchOptions = {
            method: 'DELETE',
            credentials: 'include',
            headers: options.headers || {},
            query: options.query || {},
            returnFullRes: options.returnFullRes || true,
        };
        return this._request(options.url, fetchOptions);
    }

    async addAuthHeaders(headers: Record<string, string>): Promise<Record<string, string>> {
        return headers;
    }

    async refreshAuth(): Promise<boolean> {
        throw new Error('refreshAuth not yet defined in child of Requester');
    }
}
