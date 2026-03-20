import { Requester, type RequesterParams } from './requester';
import { get } from '../../assertions';
import { ModuleConstants } from '../ModuleConstants';

export interface BasicAuthRequesterParams extends RequesterParams {
    username?: string | null;
    password?: string | null;
}

export class BasicAuthRequester extends Requester {
    static readonly requesterType = ModuleConstants.authType.basic;

    username: string | null;
    password: string | null;

    constructor(params: BasicAuthRequesterParams) {
        super(params);

        this.username = get(params, 'username', null) as string | null;
        this.password = get(params, 'password', null) as string | null;
    }

    async addAuthHeaders(headers: Record<string, string>): Promise<Record<string, string>> {
        if (this.username && this.password) {
            headers['Authorization'] =
                'Basic ' +
                Buffer.from(this.username + ':' + this.password).toString(
                    'base64'
                );
        }
        return headers;
    }

    isAuthenticated(): boolean {
        return (
            this.username !== null &&
            this.username !== undefined &&
            this.username.trim().length > 0
        );
    }

    setUsername(username: string): void {
        this.username = username;
    }

    setPassword(password: string): void {
        this.password = password;
    }
}
