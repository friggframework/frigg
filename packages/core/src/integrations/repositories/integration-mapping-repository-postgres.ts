import { IntegrationMappingRepositoryInterface } from './integration-mapping-repository-interface';
import type { IntegrationMappingRecord, DeletionResult } from '../types';

const { prisma } = require('../../database/prisma');

export class IntegrationMappingRepositoryPostgres extends IntegrationMappingRepositoryInterface {
    private prisma: any;

    constructor() {
        super();
        this.prisma = prisma;
    }

    private _stringToInt(id: unknown): number | null | undefined {
        if (id === null || id === undefined) return id as null | undefined;
        const parsed = Number.parseInt(String(id), 10);
        if (Number.isNaN(parsed)) {
            throw new Error(`Invalid ID: ${id} cannot be converted to integer`);
        }
        return parsed;
    }

    private _toString(value: unknown): string | null | undefined {
        if (value === null || value === undefined) return value as null | undefined;
        return String(value);
    }

    private _intToString(id: unknown): string | null | undefined {
        if (id === null || id === undefined) return id as null | undefined;
        return String(id);
    }

    private _convertId(id: unknown): number | null | undefined {
        return this._stringToInt(id);
    }

    private _convertMappingIds(mapping: any): IntegrationMappingRecord | null {
        if (!mapping) return mapping;
        return {
            ...mapping,
            id: this._intToString(mapping.id),
            integrationId: this._intToString(mapping.integrationId),
        };
    }

    async findMappingBy(integrationId: string, sourceId: string): Promise<IntegrationMappingRecord | null> {
        const mapping = await this.prisma.integrationMapping.findFirst({
            where: {
                integrationId: this._stringToInt(integrationId),
                sourceId: this._toString(sourceId),
            },
        });
        return this._convertMappingIds(mapping);
    }

    async upsertMapping(integrationId: string, sourceId: string, mapping: unknown): Promise<IntegrationMappingRecord> {
        const result = await this.prisma.integrationMapping.upsert({
            where: {
                integrationId_sourceId: {
                    integrationId: this._stringToInt(integrationId),
                    sourceId: this._toString(sourceId),
                },
            },
            update: { mapping },
            create: {
                integrationId: this._stringToInt(integrationId),
                sourceId: this._toString(sourceId),
                mapping,
            },
        });
        return this._convertMappingIds(result)!;
    }

    async findMappingsByIntegration(integrationId: string): Promise<IntegrationMappingRecord[]> {
        const intIntegrationId = this._convertId(integrationId);
        const mappings = await this.prisma.integrationMapping.findMany({
            where: { integrationId: intIntegrationId },
        });
        return mappings.map((m: any) => this._convertMappingIds(m)!);
    }

    async deleteMapping(integrationId: string, sourceId: string): Promise<DeletionResult> {
        try {
            await this.prisma.integrationMapping.delete({
                where: {
                    integrationId_sourceId: {
                        integrationId: this._stringToInt(integrationId),
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
        const intIntegrationId = this._convertId(integrationId);
        const result = await this.prisma.integrationMapping.deleteMany({
            where: { integrationId: intIntegrationId },
        });
        return { acknowledged: true, deletedCount: result.count };
    }

    async findMappingById(id: string): Promise<IntegrationMappingRecord | null> {
        const intId = this._convertId(id);
        const mapping = await this.prisma.integrationMapping.findUnique({
            where: { id: intId },
        });
        return this._convertMappingIds(mapping);
    }

    async updateMapping(id: string, updates: Partial<IntegrationMappingRecord>): Promise<IntegrationMappingRecord> {
        const intId = this._convertId(id);
        const data: any = { ...updates };
        if (data.integrationId !== undefined) {
            data.integrationId = this._convertId(data.integrationId);
        }
        const mapping = await this.prisma.integrationMapping.update({
            where: { id: intId },
            data,
        });
        return this._convertMappingIds(mapping)!;
    }
}
