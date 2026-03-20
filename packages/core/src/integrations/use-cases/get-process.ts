import type { ProcessRepositoryInterface } from '../repositories/process-repository-interface';
import type { ProcessRecord } from '../types';

export class GetProcess {
    private readonly processRepository: ProcessRepositoryInterface;

    constructor({ processRepository }: { processRepository: ProcessRepositoryInterface }) {
        if (!processRepository) {
            throw new Error('processRepository is required');
        }
        this.processRepository = processRepository;
    }

    async execute(processId: string): Promise<ProcessRecord | null> {
        if (!processId || typeof processId !== 'string') {
            throw new TypeError('processId must be a non-empty string');
        }

        try {
            const process = await this.processRepository.findById(processId);
            return process;
        } catch (error: unknown) {
            const err = error as Error;
            throw new Error(`Failed to retrieve process: ${err.message}`);
        }
    }

    async executeOrThrow(processId: string): Promise<ProcessRecord> {
        const process = await this.execute(processId);

        if (!process) {
            throw new Error(`Process not found: ${processId}`);
        }

        return process;
    }

    async executeMany(processIds: string[]): Promise<ProcessRecord[]> {
        if (!Array.isArray(processIds)) {
            throw new TypeError('processIds must be an array');
        }

        const processes = await Promise.all(
            processIds.map(id => this.execute(id))
        );

        return processes.filter((p): p is ProcessRecord => p !== null);
    }
}
