import { IntegrationMappingRepositoryInterface } from './integration-mapping-repository-interface';
import type { IntegrationMappingRecord, DeletionResult } from '../types';

const { prisma } = require('../../database/prisma');

export class IntegrationMappingRepositoryMongo extends IntegrationMappingRepositoryInterface {
    private readonly prisma: any;

    constructor() {
        super();
        this.prisma = prisma;
    }

    private _toString(value: unknown): string | null | undefined {
        if (value === null || value === undefined) return value as null | undefined;
        return String(value);
    }

    async findMappingBy(integrationId: string, sourceId: string): Promise<IntegrationMappingRecord | null> {
        return await this.prisma.integrationMapping.findFirst({
            where: {
                integrationId,
                sourceId: this._toString(sourceId),
            },
        });
    }

    async upsertMapping(integrationId: string, sourceId: string, mapping: unknown): Promise<IntegrationMappingRecord> {
        return await this.prisma.integrationMapping.upsert({
            where: {
                integrationId_sourceId: {
                    integrationId,
                    sourceId: this._toString(sourceId),
                },
            },
            update: { mapping },
            create: {
                integrationId,
                sourceId: this._toString(sourceId),
                mapping,
            },
        });
    }

    async findMappingsByIntegration(integrationId: string): Promise<IntegrationMappingRecord[]> {
        return await this.prisma.integrationMapping.findMany({
            where: { integrationId },
        });
    }

    async deleteMapping(integrationId: string, sourceId: string): Promise<DeletionResult> {
        try {
            await this.prisma.integrationMapping.delete({
                where: {
                    integrationId_sourceId: {
                        integrationId,
                        sourceId: this._toString(sourceId),
                    },
                },
            });
            return { acknowledged: true, deletedCount: 1 };
        } catch (error: any) {
            if (error.code === 'P2025') {
                return { acknowledged: true, deletedCount: 0 };
            }
            throw error;
        }
    }

    async deleteMappingsByIntegration(integrationId: string): Promise<DeletionResult> {
        const result = await this.prisma.integrationMapping.deleteMany({
            where: { integrationId },
        });
        return { acknowledged: true, deletedCount: result.count };
    }

    async findMappingById(id: string): Promise<IntegrationMappingRecord | null> {
        return await this.prisma.integrationMapping.findUnique({
            where: { id },
        });
    }

    async updateMapping(id: string, updates: Partial<IntegrationMappingRecord>): Promise<IntegrationMappingRecord> {
        return await this.prisma.integrationMapping.update({
            where: { id },
            data: updates,
        });
    }
}
