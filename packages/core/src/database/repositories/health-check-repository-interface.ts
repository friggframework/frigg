export interface DatabaseConnectionState {
    readyState: number;
    stateName: string;
    isConnected: boolean;
}

export interface CredentialData {
    externalId?: string;
    data?: Record<string, unknown>;
    [key: string]: unknown;
}

export abstract class HealthCheckRepositoryInterface {
    abstract getDatabaseConnectionState(): Promise<DatabaseConnectionState>;
    abstract pingDatabase(maxTimeMS?: number): Promise<number>;
    abstract createCredential(credentialData: CredentialData): Promise<Record<string, unknown>>;
    abstract findCredentialById(id: string): Promise<Record<string, unknown> | null>;
    abstract getRawCredentialById(id: string): Promise<Record<string, unknown> | null>;
    abstract deleteCredential(id: string): Promise<void | boolean>;
}
