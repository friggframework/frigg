import { Requester } from './requester';
import type { RequesterParams } from './requester';
import { get } from '../../assertions';
import { ModuleConstants } from '../ModuleConstants';

export interface ApiKeyRequesterParams extends RequesterParams {
    api_key_name?: string;
    api_key?: string | null;
    API_KEY_VALUE?: string;
    API_KEY_NAME?: string;
}

export class ApiKeyRequester extends Requester {
    static readonly requesterType = ModuleConstants.authType.apiKey;

    readonly requesterType: string;
    api_key_name: string;
    api_key: string | null;

    constructor(params: ApiKeyRequesterParams) {
        super(params);
        this.requesterType = 'apiKey';

        this.api_key_name = get(params, 'api_key_name', 'key') as string;
        this.api_key = get(params, 'api_key', null) as string | null;

        if (!this.api_key && params.API_KEY_VALUE) {
            this.api_key = params.API_KEY_VALUE;
        }
        if (!this.api_key_name && params.API_KEY_NAME) {
            this.api_key_name = params.API_KEY_NAME;
        }
    }

    async addAuthHeaders(headers: Record<string, string>): Promise<Record<string, string>> {
        if (this.api_key) {
            headers[this.api_key_name] = this.api_key;
        }
        return headers;
    }

    isAuthenticated(): boolean {
        return (
            this.api_key !== null &&
            this.api_key !== undefined &&
            typeof this.api_key === 'string' &&
            this.api_key.trim().length > 0
        );
    }

    setApiKey(api_key: string): void {
        this.api_key = api_key;
    }

    setApiKeyName(api_key_name: string): void {
        this.api_key_name = api_key_name;
    }
}
