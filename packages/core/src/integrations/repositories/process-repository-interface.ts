import type { ProcessRecord, ProcessData } from '../types';

export abstract class ProcessRepositoryInterface {
    async create(_processData: ProcessData): Promise<ProcessRecord> {
        throw new Error('Method create() must be implemented');
    }

    async findById(_processId: string): Promise<ProcessRecord | null> {
        throw new Error('Method findById() must be implemented');
    }

    async update(_processId: string, _updates: Partial<ProcessRecord>): Promise<ProcessRecord> {
        throw new Error('Method update() must be implemented');
    }

    async findByIntegrationAndType(_integrationId: string, _type: string): Promise<ProcessRecord[]> {
        throw new Error('Method findByIntegrationAndType() must be implemented');
    }

    async findActiveProcesses(
        _integrationId: string,
        _excludeStates: string[] = ['COMPLETED', 'ERROR']
    ): Promise<ProcessRecord[]> {
        throw new Error('Method findActiveProcesses() must be implemented');
    }

    async findByName(_name: string): Promise<ProcessRecord | null> {
        throw new Error('Method findByName() must be implemented');
    }

    async deleteById(_processId: string): Promise<void> {
        throw new Error('Method deleteById() must be implemented');
    }
}
