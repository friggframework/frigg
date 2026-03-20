/* eslint-disable @typescript-eslint/no-require-imports */
import { ErrorResponse, mapErrorToResponse as _mapError } from './command-utils';
export type { ErrorResponse };
const {
    createCredentialRepository,
} = require('../../credential/repositories/credential-repository-factory');

export interface CredentialRecord {
    id: string;
    userId: string;
    externalId: string;
    access_token?: string;
    refresh_token?: string;
    authIsValid?: boolean;
    domain?: string;
}

export interface CreateCredentialParams {
    userId: string;
    externalId: string;
    access_token: string;
    refresh_token?: string;
    domain?: string;
    authIsValid?: boolean;
}

export interface CredentialFilter {
    userId?: string;
    externalId?: string;
    credentialId?: string;
}

export interface CredentialCommands {
    createCredential(params?: CreateCredentialParams): Promise<CredentialRecord | ErrorResponse>;
    findCredential(filter?: CredentialFilter): Promise<CredentialRecord | null | ErrorResponse>;
    updateCredential(credentialId: string, updates: Record<string, unknown>): Promise<CredentialRecord | ErrorResponse>;
    updateAuthenticationStatus(credentialId: string, isValid: boolean): Promise<{ success: boolean } | ErrorResponse>;
    deleteCredential(credentialId: string): Promise<{ success: boolean } | ErrorResponse>;
    deleteCredentialById(credentialId: string): Promise<{ success: boolean } | ErrorResponse>;
}

const ERROR_CODE_MAP: Record<string, number> = {
    CREDENTIAL_NOT_FOUND: 404,
    INVALID_CREDENTIAL_DATA: 400,
};

function mapErrorToResponse(error: Error & { code?: string }): ErrorResponse {
    return _mapError(ERROR_CODE_MAP, error);
}

export function createCredentialCommands(): CredentialCommands {
    const credRepo = createCredentialRepository();

    return {
        async createCredential({
            userId,
            externalId,
            access_token,
            refresh_token,
            domain,
            authIsValid = true,
        }: CreateCredentialParams = {} as CreateCredentialParams) {
            try {
                if (!userId || !externalId || !access_token) {
                    const error = new Error(
                        'userId, externalId, and access_token are required'
                    ) as Error & { code?: string };
                    error.code = 'INVALID_CREDENTIAL_DATA';
                    throw error;
                }

                const credentialData: Record<string, unknown> = {
                    identifiers: { userId, externalId },
                    details: {
                        access_token,
                        authIsValid,
                    } as Record<string, unknown>,
                };

                if (refresh_token) {
                    (credentialData.details as Record<string, unknown>).refresh_token = refresh_token;
                }
                if (domain) {
                    (credentialData.details as Record<string, unknown>).domain = domain;
                }

                const credential = await credRepo.upsertCredential(
                    credentialData
                );

                return {
                    id: credential.id as string,
                    userId: credential.userId as string,
                    externalId: credential.externalId as string,
                    access_token: credential.access_token as string | undefined,
                    refresh_token: credential.refresh_token as string | undefined,
                    authIsValid: credential.authIsValid as boolean | undefined,
                };
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async findCredential(filter: CredentialFilter = {}) {
            try {
                if (
                    !filter.userId &&
                    !filter.externalId &&
                    !filter.credentialId
                ) {
                    const error = new Error(
                        'At least one filter criterion is required'
                    ) as Error & { code?: string };
                    error.code = 'INVALID_CREDENTIAL_DATA';
                    throw error;
                }

                const credential = await credRepo.findCredential(filter);

                if (!credential) {
                    return null;
                }

                return {
                    id: credential.id as string,
                    userId: credential.userId as string,
                    externalId: credential.externalId as string,
                    access_token: credential.access_token as string | undefined,
                    refresh_token: credential.refresh_token as string | undefined,
                    authIsValid: credential.authIsValid as boolean | undefined,
                    domain: credential.domain as string | undefined,
                };
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async updateCredential(credentialId: string, updates: Record<string, unknown>) {
            try {
                if (!credentialId) {
                    const error = new Error('credentialId is required') as Error & { code?: string };
                    error.code = 'INVALID_CREDENTIAL_DATA';
                    throw error;
                }

                const credential = await credRepo.updateCredential(
                    credentialId,
                    updates
                );

                if (!credential) {
                    const error = new Error(
                        `Credential ${credentialId} not found`
                    ) as Error & { code?: string };
                    error.code = 'CREDENTIAL_NOT_FOUND';
                    throw error;
                }

                return {
                    id: credential.id as string,
                    userId: credential.userId as string,
                    externalId: credential.externalId as string,
                    access_token: credential.access_token as string | undefined,
                    refresh_token: credential.refresh_token as string | undefined,
                    authIsValid: credential.authIsValid as boolean | undefined,
                    domain: credential.domain as string | undefined,
                };
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async updateAuthenticationStatus(credentialId: string, isValid: boolean) {
            try {
                if (!credentialId) {
                    const error = new Error('credentialId is required') as Error & { code?: string };
                    error.code = 'INVALID_CREDENTIAL_DATA';
                    throw error;
                }

                await credRepo.updateAuthenticationStatus(
                    credentialId,
                    isValid
                );

                return { success: true };
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async deleteCredential(credentialId: string) {
            try {
                if (!credentialId) {
                    const error = new Error('credentialId is required') as Error & { code?: string };
                    error.code = 'INVALID_CREDENTIAL_DATA';
                    throw error;
                }

                await credRepo.deleteCredentialById(credentialId);

                return { success: true };
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async deleteCredentialById(credentialId: string) {
            try {
                if (!credentialId) {
                    const error = new Error('credentialId is required') as Error & { code?: string };
                    error.code = 'INVALID_CREDENTIAL_DATA';
                    throw error;
                }

                await credRepo.deleteCredentialById(credentialId);

                return { success: true };
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },
    };
}

export { ERROR_CODE_MAP };
