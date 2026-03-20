export interface ConnectionData {
    id?: string;
    connectionId: string;
    createdAt?: Date;
    updatedAt?: Date;
    [key: string]: unknown;
}

export interface ActiveConnection {
    connectionId: string;
    send: (data: unknown) => Promise<void>;
}

export interface ConnectionDeleteResult {
    acknowledged: boolean;
    deletedCount: number;
}

export class WebsocketConnectionRepositoryInterface {
    async createConnection(_connectionId: string): Promise<ConnectionData> {
        throw new Error('Method createConnection must be implemented by subclass');
    }

    async deleteConnection(_connectionId: string): Promise<ConnectionDeleteResult> {
        throw new Error('Method deleteConnection must be implemented by subclass');
    }

    async getActiveConnections(): Promise<ActiveConnection[]> {
        throw new Error('Method getActiveConnections must be implemented by subclass');
    }

    async findConnection(_connectionId: string): Promise<ConnectionData | null> {
        throw new Error('Method findConnection must be implemented by subclass');
    }

    async findConnectionById(_id: string): Promise<ConnectionData | null> {
        throw new Error('Method findConnectionById must be implemented by subclass');
    }

    async getAllConnections(): Promise<ConnectionData[]> {
        throw new Error('Method getAllConnections must be implemented by subclass');
    }

    async deleteAllConnections(): Promise<ConnectionDeleteResult> {
        throw new Error('Method deleteAllConnections must be implemented by subclass');
    }
}
