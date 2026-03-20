import { Requester } from './requester';
import type { RequesterParams } from './requester';
import { get } from '../../assertions';
import { ModuleConstants } from '../ModuleConstants';

export interface TokenResponse {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    x_refresh_token_expires_in?: number;
    [key: string]: unknown;
}

export interface OAuth2RequesterParams extends RequesterParams {
    grant_type?: string;
    client_id?: string | null;
    client_secret?: string | null;
    redirect_uri?: string | null;
    scope?: string | null;
    authorizationUri?: string | null;
    tokenUri?: string | null;
    baseURL?: string | null;
    access_token?: string | null;
    refresh_token?: string | null;
    accessTokenExpire?: Date | null;
    refreshTokenExpire?: Date | null;
    audience?: string | null;
    username?: string | null;
    password?: string | null;
    state?: string | null;
}

export interface AuthorizationRequirements {
    url: string | null;
    type: string;
}

export class OAuth2Requester extends Requester {
    static requesterType = ModuleConstants.authType.oauth2;

    DLGT_TOKEN_UPDATE: string;
    DLGT_TOKEN_DEAUTHORIZED: string;
    grant_type: string;
    client_id: string | null;
    client_secret: string | null;
    redirect_uri: string | null;
    scope: string | null;
    authorizationUri: string | null;
    tokenUri: string | null;
    baseURL: string | null;
    access_token: string | null;
    refresh_token: string | null;
    accessTokenExpire: Date | null;
    refreshTokenExpire: Date | null;
    audience: string | null;
    username: string | null;
    password: string | null;
    state: string | null;

    constructor(params: OAuth2RequesterParams) {
        super(params);
        this.DLGT_TOKEN_UPDATE = 'TOKEN_UPDATE';
        this.DLGT_TOKEN_DEAUTHORIZED = 'TOKEN_DEAUTHORIZED';

        this.delegateTypes.push(this.DLGT_TOKEN_UPDATE);
        this.delegateTypes.push(this.DLGT_TOKEN_DEAUTHORIZED);

        this.grant_type = get(params, 'grant_type', 'authorization_code') as string;
        this.client_id = get(params, 'client_id', null) as string | null;
        this.client_secret = get(params, 'client_secret', null) as string | null;
        this.redirect_uri = get(params, 'redirect_uri', null) as string | null;
        this.scope = get(params, 'scope', null) as string | null;
        this.authorizationUri = get(params, 'authorizationUri', null) as string | null;
        this.tokenUri = get(params, 'tokenUri', null) as string | null;
        this.baseURL = get(params, 'baseURL', null) as string | null;
        this.access_token = get(params, 'access_token', null) as string | null;
        this.refresh_token = get(params, 'refresh_token', null) as string | null;
        this.accessTokenExpire = get(params, 'accessTokenExpire', null) as Date | null;
        this.refreshTokenExpire = get(params, 'refreshTokenExpire', null) as Date | null;
        this.audience = get(params, 'audience', null) as string | null;
        this.username = get(params, 'username', null) as string | null;
        this.password = get(params, 'password', null) as string | null;
        this.state = get(params, 'state', null) as string | null;

        this.isRefreshable = true;
    }

    async setTokens(params: TokenResponse): Promise<void> {
        this.access_token = get(params, 'access_token') as string;
        const newRefreshToken = get(params, 'refresh_token', null) as string | null;
        if (newRefreshToken !== null) {
            this.refresh_token = newRefreshToken;
        } else {
            if (this.refresh_token) {
                console.log(
                    '[Frigg] No refresh_token in response, preserving existing'
                );
            } else {
                console.log(
                    '[Frigg] Current refresh_token is null and no new refresh_token in response'
                );
            }
        }
        const accessExpiresIn = get(params, 'expires_in', null) as number | null;
        const refreshExpiresIn = get(
            params,
            'x_refresh_token_expires_in',
            null
        ) as number | null;

        this.accessTokenExpire = new Date(Date.now() + (accessExpiresIn ?? 0) * 1000);
        if (refreshExpiresIn !== null) {
            this.refreshTokenExpire = new Date(
                Date.now() + refreshExpiresIn * 1000
            );
        }

        await this.notify(this.DLGT_TOKEN_UPDATE);
    }

    getAuthorizationUri(): string | null {
        return this.authorizationUri;
    }

    getAuthorizationRequirements(): AuthorizationRequirements {
        return {
            url: this.getAuthorizationUri(),
            type: 'oauth2',
        };
    }

    async getTokenFromCode(code: string): Promise<TokenResponse> {
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('client_id', this.client_id!);
        params.append('client_secret', this.client_secret!);
        params.append('redirect_uri', this.redirect_uri!);
        params.append('scope', this.scope!);
        params.append('code', code);
        const options = {
            body: params as unknown,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            url: this.tokenUri!,
        };
        const response = await this._post(options, false) as TokenResponse;
        await this.setTokens(response);
        return response;
    }

    async getTokenFromCodeBasicAuthHeader(code: string): Promise<TokenResponse> {
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('client_id', this.client_id!);
        params.append('redirect_uri', this.redirect_uri!);
        params.append('code', code);

        const options = {
            body: params as unknown,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${Buffer.from(
                    `${this.client_id}:${this.client_secret}`
                ).toString('base64')}`,
            },
            url: this.tokenUri!,
        };

        const response = await this._post(options, false) as TokenResponse;
        await this.setTokens(response);
        return response;
    }

    async refreshAccessToken(refreshTokenObject: { refresh_token: string }): Promise<TokenResponse> {
        this.access_token = undefined as unknown as string | null;
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('client_id', this.client_id!);
        params.append('client_secret', this.client_secret!);
        params.append('refresh_token', refreshTokenObject.refresh_token);
        params.append('redirect_uri', this.redirect_uri!);

        const options = {
            body: params as unknown,
            url: this.tokenUri!,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        };
        console.log('[Frigg] Refreshing access token with options');
        const response = await this._post(options, false) as TokenResponse;
        await this.setTokens(response);
        return response;
    }

    async addAuthHeaders(headers: Record<string, string>): Promise<Record<string, string>> {
        delete headers.Authorization;
        if (this.access_token) {
            headers.Authorization = `Bearer ${this.access_token}`;
        }

        return headers;
    }

    isAuthenticated(): boolean {
        return !!(
            this.access_token !== null &&
            this.refresh_token !== null &&
            this.accessTokenExpire &&
            this.refreshTokenExpire
        );
    }

    async refreshAuth(): Promise<boolean> {
        try {
            console.log('[Frigg] Starting token refresh', {
                grant_type: this.grant_type,
                has_refresh_token: !!this.refresh_token,
                has_client_id: !!this.client_id,
                has_client_secret: !!this.client_secret,
                has_token_uri: !!this.tokenUri,
                tokenUri: this.tokenUri,
            });

            if (this.grant_type !== 'client_credentials') {
                await this.refreshAccessToken({
                    refresh_token: this.refresh_token!,
                });
            } else {
                await this.getTokenFromClientCredentials();
            }
            console.log('[Frigg] Token refresh succeeded');
            return true;
        } catch (error: unknown) {
            const err = error as { message?: string; name?: string; response?: { status?: number; data?: unknown } };
            console.error('[Frigg] Token refresh failed', {
                error_message: err?.message,
                error_name: err?.name,
                response_status: err?.response?.status,
                response_data: err?.response?.data,
            });
            await this.notify(this.DLGT_INVALID_AUTH);
            return false;
        }
    }

    async getTokenFromUsernamePassword(): Promise<TokenResponse | undefined> {
        try {
            const url = this.tokenUri!;

            const body = {
                username: this.username,
                password: this.password,
                grant_type: 'password',
            };
            const headers = {
                'Content-Type': 'application/json',
            };

            const tokenRes = await this._post({
                url,
                body,
                headers,
            }) as TokenResponse;

            await this.setTokens(tokenRes);
            return tokenRes;
        } catch {
            await this.notify(this.DLGT_INVALID_AUTH);
        }
    }

    async getTokenFromClientCredentials(): Promise<TokenResponse | undefined> {
        try {
            const url = this.tokenUri!;

            const body = {
                audience: this.audience,
                client_id: this.client_id,
                client_secret: this.client_secret,
                grant_type: 'client_credentials',
            };
            const headers = {
                'Content-Type': 'application/json',
            };

            const tokenRes = await this._post({
                url,
                body,
                headers,
            }) as TokenResponse;

            await this.setTokens(tokenRes);
            return tokenRes;
        } catch {
            await this.notify(this.DLGT_INVALID_AUTH);
        }
    }
}
