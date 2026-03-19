import fetch from 'node-fetch';
import type { Response, RequestInit } from 'node-fetch';
import type { Agent } from 'http';
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
            contentType.match(/^application\/json/) ||
            contentType.match(/^application\/vnd.api\+json/) ||
            contentType.match(/^application\/hal\+json/)
        ) {
            return resp.json();
        }

        return resp.text();
    };

    async _request(url: string, options: FetchOptions, i = 0): Promise<unknown> {
        let encodedUrl = encodeURI(url);
        if (options.query) {
            let queryBuild = '?';
            for (const key in options.query) {
                queryBuild += `${encodeURIComponent(key)}=${encodeURIComponent(
                    options.query[key]
                )}&`;
            }
            encodedUrl += queryBuild.slice(0, -1);
        }

        options.headers = await this.addAuthHeaders(options.headers);

        if (this.agent) (options as unknown as Record<string, unknown>).agent = this.agent;

        let response: Response;
        try {
            response = await this.fetch(encodedUrl, options as RequestInit);
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

        if ((status === 429 || status >= 500) && i < this.backOff.length) {
            const delay = this.backOff[i] * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
            return this._request(url, options, i + 1);
        } else if (status === 401) {
            if (!this.isRefreshable || this.refreshCount > 0) {
                await this.notify(this.DLGT_INVALID_AUTH);
            } else {
                this.refreshCount++;
                const refreshSucceeded = await this.refreshAuth();
                if (refreshSucceeded) {
                    return this._request(url, options, i + 1);
                }
            }
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
            headers: (options.headers || {}) as Record<string, string>,
            query: (options.query || {}) as Record<string, string>,
            returnFullRes: options.returnFullRes || false,
        };

        return this._request(options.url, fetchOptions);
    }

    async _post(options: RequestOptions, stringify = true): Promise<unknown> {
        const fetchOptions: FetchOptions = {
            method: 'POST',
            credentials: 'include',
            headers: (options.headers || {}) as Record<string, string>,
            query: (options.query || {}) as Record<string, string>,
            body: stringify ? JSON.stringify(options.body) : options.body as string,
            returnFullRes: options.returnFullRes || false,
        };
        return this._request(options.url, fetchOptions);
    }

    async _patch(options: RequestOptions, stringify = true): Promise<unknown> {
        const fetchOptions: FetchOptions = {
            method: 'PATCH',
            credentials: 'include',
            headers: (options.headers || {}) as Record<string, string>,
            query: (options.query || {}) as Record<string, string>,
            body: stringify ? JSON.stringify(options.body) : options.body as string,
            returnFullRes: options.returnFullRes || false,
        };
        return this._request(options.url, fetchOptions);
    }

    async _put(options: RequestOptions, stringify = true): Promise<unknown> {
        const fetchOptions: FetchOptions = {
            method: 'PUT',
            credentials: 'include',
            headers: (options.headers || {}) as Record<string, string>,
            query: (options.query || {}) as Record<string, string>,
            body: stringify ? JSON.stringify(options.body) : options.body as string,
            returnFullRes: options.returnFullRes || false,
        };
        return this._request(options.url, fetchOptions);
    }

    async _delete(options: RequestOptions): Promise<unknown> {
        const fetchOptions: FetchOptions = {
            method: 'DELETE',
            credentials: 'include',
            headers: (options.headers || {}) as Record<string, string>,
            query: (options.query || {}) as Record<string, string>,
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
