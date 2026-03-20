import type { IntegrationRecord, IntegrationConfig, DeletionResult } from '../types';

export abstract class IntegrationRepositoryInterface {
    async findIntegrationsByUserId(_userId: string): Promise<IntegrationRecord[]> {
        throw new Error('Method findIntegrationsByUserId must be implemented by subclass');
    }

    async deleteIntegrationById(_integrationId: string): Promise<DeletionResult> {
        throw new Error('Method deleteIntegrationById must be implemented by subclass');
    }

    async findIntegrationByName(_name: string): Promise<IntegrationRecord> {
        throw new Error('Method findIntegrationByName must be implemented by subclass');
    }

    async findIntegrationById(_id: string): Promise<IntegrationRecord> {
        throw new Error('Method findIntegrationById must be implemented by subclass');
    }

    async updateIntegrationStatus(_integrationId: string, _status: string): Promise<boolean> {
        throw new Error('Method updateIntegrationStatus must be implemented by subclass');
    }

    async updateIntegrationMessages(
        _integrationId: string,
        _messageType: string,
        _messageTitle: string,
        _messageBody: string,
        _messageTimestamp: number | Date
    ): Promise<boolean> {
        throw new Error('Method updateIntegrationMessages must be implemented by subclass');
    }

    async createIntegration(
        _entities: string[],
        _userId: string,
        _config: IntegrationConfig
    ): Promise<IntegrationRecord> {
        throw new Error('Method createIntegration must be implemented by subclass');
    }

    async findIntegrationByUserId(_userId: string): Promise<IntegrationRecord | null> {
        throw new Error('Method findIntegrationByUserId must be implemented by subclass');
    }

    async updateIntegrationConfig(
        _integrationId: string,
        _config: IntegrationConfig
    ): Promise<IntegrationRecord> {
        throw new Error('Method updateIntegrationConfig must be implemented by subclass');
    }
}
