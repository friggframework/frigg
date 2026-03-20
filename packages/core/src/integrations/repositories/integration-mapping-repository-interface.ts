import type { IntegrationMappingRecord, DeletionResult } from '../types';

export abstract class IntegrationMappingRepositoryInterface {
    async findMappingBy(
        _integrationId: string,
        _sourceId: string
    ): Promise<IntegrationMappingRecord | null> {
        throw new Error('Method findMappingBy must be implemented by subclass');
    }

    async upsertMapping(
        _integrationId: string,
        _sourceId: string,
        _mapping: unknown
    ): Promise<IntegrationMappingRecord> {
        throw new Error('Method upsertMapping must be implemented by subclass');
    }

    async findMappingsByIntegration(
        _integrationId: string
    ): Promise<IntegrationMappingRecord[]> {
        throw new Error(
            'Method findMappingsByIntegration must be implemented by subclass'
        );
    }

    async deleteMapping(
        _integrationId: string,
        _sourceId: string
    ): Promise<DeletionResult> {
        throw new Error('Method deleteMapping must be implemented by subclass');
    }

    async deleteMappingsByIntegration(
        _integrationId: string
    ): Promise<DeletionResult> {
        throw new Error(
            'Method deleteMappingsByIntegration must be implemented by subclass'
        );
    }

    async findMappingById(
        _id: string
    ): Promise<IntegrationMappingRecord | null> {
        throw new Error(
            'Method findMappingById must be implemented by subclass'
        );
    }

    async updateMapping(
        _id: string,
        _updates: Partial<IntegrationMappingRecord>
    ): Promise<IntegrationMappingRecord> {
        throw new Error('Method updateMapping must be implemented by subclass');
    }
}
