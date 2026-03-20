import type { ProcessRepositoryInterface } from '../repositories/process-repository-interface';
import type { ProcessData, ProcessRecord } from '../types';

export class CreateProcess {
    private processRepository: ProcessRepositoryInterface;

    constructor({ processRepository }: { processRepository: ProcessRepositoryInterface }) {
        if (!processRepository) {
            throw new Error('processRepository is required');
        }
        this.processRepository = processRepository;
    }

    async execute(processData: ProcessData): Promise<ProcessRecord> {
        this._validateProcessData(processData);

        const processToCreate: ProcessData = {
            userId: processData.userId,
            integrationId: processData.integrationId,
            name: processData.name,
            type: processData.type,
            state: processData.state || 'INITIALIZING',
            context: processData.context || {},
            results: processData.results || {},
            childProcesses: processData.childProcesses || [],
            parentProcessId: processData.parentProcessId || undefined,
        };

        try {
            const createdProcess = await this.processRepository.create(processToCreate);
            return createdProcess;
        } catch (error: unknown) {
            const err = error as Error;
            throw new Error(`Failed to create process: ${err.message}`);
        }
    }

    private _validateProcessData(processData: ProcessData): void {
        const requiredFields: (keyof ProcessData)[] = ['userId', 'integrationId', 'name', 'type'];
        const missingFields = requiredFields.filter(field => !processData[field]);

        if (missingFields.length > 0) {
            throw new Error(
                `Missing required fields for process creation: ${missingFields.join(', ')}`
            );
        }

        if (typeof processData.userId !== 'string') {
            throw new Error('userId must be a string');
        }
        if (typeof processData.integrationId !== 'string') {
            throw new Error('integrationId must be a string');
        }
        if (typeof processData.name !== 'string') {
            throw new Error('name must be a string');
        }
        if (typeof processData.type !== 'string') {
            throw new Error('type must be a string');
        }

        if (processData.state && typeof processData.state !== 'string') {
            throw new Error('state must be a string');
        }
        if (processData.context && typeof processData.context !== 'object') {
            throw new Error('context must be an object');
        }
        if (processData.results && typeof processData.results !== 'object') {
            throw new Error('results must be an object');
        }
        if (processData.childProcesses && !Array.isArray(processData.childProcesses)) {
            throw new Error('childProcesses must be an array');
        }
        if (processData.parentProcessId && typeof processData.parentProcessId !== 'string') {
            throw new Error('parentProcessId must be a string');
        }
    }
}
