export interface CredentialData {
    id?: string;
    _id?: string;
    userId?: string;
    externalId?: string | null;
    authIsValid?: boolean | null;
    access_token?: string;
    refresh_token?: string;
    domain?: string;
    [key: string]: unknown;
}

export interface CredentialIdentifiers {
    _id?: string;
    id?: string;
    userId?: string;
    externalId?: string;
}

export interface CredentialUpsertParams {
    identifiers: CredentialIdentifiers;
    details: Record<string, unknown>;
}

export interface CredentialFilter {
    credentialId?: string;
    id?: string;
    userId?: string;
    externalId?: string;
}

export interface MutationResult {
    acknowledged: boolean;
    modifiedCount?: number;
    deletedCount?: number;
}

export class CredentialRepositoryInterface {
    async findCredentialById(_id: string): Promise<CredentialData | null> {
        throw new Error('Method findCredentialById must be implemented by subclass');
    }

    async updateAuthenticationStatus(_credentialId: string, _authIsValid: boolean): Promise<MutationResult> {
        throw new Error('Method updateAuthenticationStatus must be implemented by subclass');
    }

    async deleteCredentialById(_credentialId: string): Promise<MutationResult> {
        throw new Error('Method deleteCredentialById must be implemented by subclass');
    }

    async upsertCredential(_credentialDetails: CredentialUpsertParams): Promise<CredentialData> {
        throw new Error('Method upsertCredential must be implemented by subclass');
    }

    async findCredential(_filter: CredentialFilter): Promise<CredentialData | null> {
        throw new Error('Method findCredential must be implemented by subclass');
    }

    async updateCredential(_credentialId: string, _updates: Record<string, unknown>): Promise<CredentialData | null> {
        throw new Error('Method updateCredential must be implemented by subclass');
    }
}
