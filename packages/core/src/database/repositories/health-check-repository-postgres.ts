import {
    HealthCheckRepositoryInterface,
    DatabaseConnectionState,
    CredentialData,
} from './health-check-repository-interface';
import type { PrismaClientLike } from '../prisma';

export class HealthCheckRepositoryPostgreSQL extends HealthCheckRepositoryInterface {
    private readonly prisma: PrismaClientLike;

    constructor({ prismaClient }: { prismaClient: PrismaClientLike }) {
        super();
        this.prisma = prismaClient;
    }

    async getDatabaseConnectionState(): Promise<DatabaseConnectionState> {
        let isConnected = false;
        let stateName = 'unknown';

        try {
            await (this.prisma as any).$queryRaw`SELECT 1`;
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
        await (this.prisma as any).$queryRaw`SELECT 1`;
        return Date.now() - pingStart;
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
        const results: Record<string, unknown>[] = await (this.prisma as any).$queryRaw`
            SELECT * FROM "Credential" WHERE id = ${id}
        `;

        if (!results || results.length === 0) {
            return null;
        }

        return results[0];
    }

    async deleteCredential(id: string): Promise<void> {
        await (this.prisma as any).credential.delete({
            where: { id },
        });
    }
}
