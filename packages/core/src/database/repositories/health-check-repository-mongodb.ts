import {
    HealthCheckRepositoryInterface,
    DatabaseConnectionState,
    CredentialData,
} from './health-check-repository-interface';
import type { PrismaClientLike } from '../prisma';

export class HealthCheckRepositoryMongoDB extends HealthCheckRepositoryInterface {
    private readonly prisma: PrismaClientLike;

    constructor({ prismaClient }: { prismaClient: PrismaClientLike }) {
        super();
        this.prisma = prismaClient;
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
        return await (this.prisma as any).credential.create({
            data: credentialData,
        });
    }

    async findCredentialById(id: string): Promise<Record<string, unknown> | null> {
        return await (this.prisma as any).credential.findUnique({
            where: { id },
        });
    }

    async getRawCredentialById(id: string): Promise<Record<string, unknown> | null> {
        if (!id) return null;
        const results = await (this.prisma as any).credential.findRaw({
            filter: { _id: { $oid: id } },
        });
        return results[0] || null;
    }

    async deleteCredential(id: string): Promise<void> {
        await (this.prisma as any).credential.delete({
            where: { id },
        });
    }
}
