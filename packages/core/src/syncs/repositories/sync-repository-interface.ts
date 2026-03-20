export interface SyncDataIdentifier {
    entity?: string;
    id?: unknown;
    hash?: string;
    syncId?: string;
    entityId?: string;
    idData?: unknown;
    createdAt?: Date | string;
    [key: string]: unknown;
}

export interface SyncData {
    id?: string;
    name?: string;
    hash?: string;
    integrationId?: string;
    entities?: unknown[];
    entityIds?: string[];
    dataIdentifiers?: SyncDataIdentifier[];
    context?: unknown;
    results?: unknown;
    [key: string]: unknown;
}

export interface SyncFilter {
    _id?: string;
    id?: string;
    name?: string;
    integrationId?: string;
    integration?: string;
    entities?: unknown;
    dataIdentifiers?: unknown;
    [key: string]: unknown;
}

export class SyncRepositoryInterface {
    async getSyncObject(_name: string, _dataIdentifier: unknown, _entity: string | number): Promise<SyncData | null> {
        throw new Error('Method getSyncObject must be implemented by subclass');
    }

    async upsertSync(_filter: SyncFilter, _syncData: Record<string, unknown>): Promise<SyncData> {
        throw new Error('Method upsertSync must be implemented by subclass');
    }

    async updateSync(_id: string | number, _updates: Record<string, unknown>): Promise<SyncData | null> {
        throw new Error('Method updateSync must be implemented by subclass');
    }

    async addDataIdentifier(_syncId: string | number, _dataIdentifier: SyncDataIdentifier): Promise<SyncData | null> {
        throw new Error('Method addDataIdentifier must be implemented by subclass');
    }

    getEntityObjIdForEntityIdFromObject(_syncObj: SyncData, _entityId: string | number): unknown {
        throw new Error('Method getEntityObjIdForEntityIdFromObject must be implemented by subclass');
    }

    async findSyncs(_filter: SyncFilter): Promise<SyncData[]> {
        throw new Error('Method findSyncs must be implemented by subclass');
    }

    async findOneSync(_filter: SyncFilter): Promise<SyncData | null> {
        throw new Error('Method findOneSync must be implemented by subclass');
    }

    async deleteSync(_id: string | number): Promise<unknown> {
        throw new Error('Method deleteSync must be implemented by subclass');
    }
}
