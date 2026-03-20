import {
    HealthCheckRepositoryInterface,
    DatabaseConnectionState,
    CredentialData,
} from './health-check-repository-interface';
import {
    toObjectId,
    fromObjectId,
    findOne,
    insertOne,
    deleteOne,
} from '../documentdb-utils';
import { DocumentDBEncryptionService } from '../documentdb-encryption-service';
import type { PrismaClientLike } from '../prisma';

export class HealthCheckRepositoryDocumentDB extends HealthCheckRepositoryInterface {
    private prisma: PrismaClientLike;
    private readonly encryptionService: DocumentDBEncryptionService;

    constructor({ prismaClient }: { prismaClient: PrismaClientLike }) {
        super();
        this.prisma = prismaClient;
        this.encryptionService = new DocumentDBEncryptionService();
    }

    async getDatabaseConnectionState(): Promise<DatabaseConnectionState> {
        let isConnected = false;
        let stateName = 'unknown';

        try {
            await this.prisma.$runCommandRaw!({ ping: 1 });
            isConnected = true;
            stateName = 'connected';
        } catch {
            stateName = 'disconnected';
        }

        return {
            readyState: isConnected ? 1 : 0,
            stateName,
            isConnected,
        };
    }

    async pingDatabase(maxTimeMS: number = 2000): Promise<number> {
        const pingStart = Date.now();
        let timeoutId: ReturnType<typeof setTimeout>;

        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Database ping timeout')), maxTimeMS);
        });

        try {
            await Promise.race([
                this.prisma.$runCommandRaw!({ ping: 1 }),
                timeoutPromise,
            ]);
            return Date.now() - pingStart;
        } finally {
            clearTimeout(timeoutId!);
        }
    }

    async createCredential(credentialData: CredentialData): Promise<Record<string, unknown>> {
        const now = new Date();
        const document: Record<string, unknown> = {
            ...credentialData,
            createdAt: now,
            updatedAt: now,
        };

        const encryptedDocument = await this.encryptionService.encryptFields(
            'Credential',
            document
        );
        const insertedId = await insertOne(this.prisma, 'Credential', encryptedDocument);
        const created = await findOne(this.prisma, 'Credential', { _id: insertedId });

        const decrypted = await this.encryptionService.decryptFields(
            'Credential',
            created!
        );

        return {
            id: fromObjectId(decrypted._id),
            ...decrypted,
        };
    }

    async findCredentialById(id: string): Promise<Record<string, unknown> | null> {
        const doc = await findOne(this.prisma, 'Credential', {
            _id: toObjectId(id),
        });

        if (!doc) return null;

        const decrypted = await this.encryptionService.decryptFields('Credential', doc);

        return {
            id: fromObjectId(decrypted._id),
            ...decrypted,
        };
    }

    async getRawCredentialById(id: string): Promise<Record<string, unknown> | null> {
        const objectId = toObjectId(id);
        if (!objectId) return null;

        const result = await this.prisma.$runCommandRaw!({
            find: 'Credential',
            filter: { _id: objectId },
        }) as Record<string, unknown>;

        return (result?.cursor as Record<string, unknown>)?.firstBatch
            ? ((result.cursor as Record<string, unknown>).firstBatch as Record<string, unknown>[])[0] ?? null
            : null;
    }

    async deleteCredential(id: string): Promise<boolean> {
        const objectId = toObjectId(id);
        if (!objectId) return false;

        const result = await deleteOne(this.prisma, 'Credential', { _id: objectId });
        const deleted = result?.n ?? 0;
        return (deleted as number) > 0;
    }
}
