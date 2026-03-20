import type { ProcessRepositoryInterface } from '../repositories/process-repository-interface';
import type { ProcessRecord } from '../types';

export class UpdateProcessState {
    private readonly processRepository: ProcessRepositoryInterface;

    constructor({ processRepository }: { processRepository: ProcessRepositoryInterface }) {
        if (!processRepository) {
            throw new Error('processRepository is required');
        }
        this.processRepository = processRepository;
    }

    async execute(
        processId: string,
        newState: string,
        contextUpdates: Record<string, unknown> = {}
    ): Promise<ProcessRecord> {
        if (!processId || typeof processId !== 'string') {
            throw new TypeError('processId must be a non-empty string');
        }
        if (!newState || typeof newState !== 'string') {
            throw new TypeError('newState must be a non-empty string');
        }
        if (contextUpdates && typeof contextUpdates !== 'object') {
            throw new TypeError('contextUpdates must be an object');
        }

        const process = await this.processRepository.findById(processId);
        if (!process) {
            throw new Error(`Process not found: ${processId}`);
        }

        const updates: Record<string, unknown> = {
            state: newState,
        };

        if (contextUpdates && Object.keys(contextUpdates).length > 0) {
            updates.context = {
                ...process.context,
                ...contextUpdates,
            };
        }

        try {
            const updatedProcess = await this.processRepository.update(processId, updates);
            return updatedProcess;
        } catch (error: unknown) {
            const err = error as Error;
            throw new Error(`Failed to update process state: ${err.message}`);
        }
    }

    async updateStateOnly(processId: string, newState: string): Promise<ProcessRecord> {
        return this.execute(processId, newState, {});
    }

    async updateContextOnly(processId: string, contextUpdates: Record<string, unknown>): Promise<ProcessRecord> {
        const process = await this.processRepository.findById(processId);
        if (!process) {
            throw new Error(`Process not found: ${processId}`);
        }

        const updates = {
            context: {
                ...process.context,
                ...contextUpdates,
            },
        };

        return this.processRepository.update(processId, updates);
    }
}
