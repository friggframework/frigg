import type { ProcessRepositoryInterface } from '../repositories/process-repository-interface';
import type { MetricsUpdate, ProcessRecord } from '../types';

interface WebsocketService {
    broadcast(message: Record<string, unknown>): Promise<void>;
}

export class UpdateProcessMetrics {
    private processRepository: ProcessRepositoryInterface;
    private websocketService?: WebsocketService;

    constructor({ processRepository, websocketService }: {
        processRepository: ProcessRepositoryInterface;
        websocketService?: WebsocketService;
    }) {
        if (!processRepository) {
            throw new Error('processRepository is required');
        }
        this.processRepository = processRepository;
        this.websocketService = websocketService;
    }

    async execute(processId: string, metricsUpdate: MetricsUpdate): Promise<ProcessRecord> {
        if (!processId || typeof processId !== 'string') {
            throw new TypeError('processId must be a non-empty string');
        }
        if (!metricsUpdate || typeof metricsUpdate !== 'object') {
            throw new TypeError('metricsUpdate must be an object');
        }

        const process = await this.processRepository.findById(processId);
        if (!process) {
            throw new Error(`Process not found: ${processId}`);
        }

        const context: Record<string, unknown> = process.context || {};
        const results: Record<string, unknown> = process.results || { aggregateData: {} };

        if (!(results as { aggregateData?: Record<string, unknown> }).aggregateData) {
            (results as { aggregateData: Record<string, unknown> }).aggregateData = {};
        }

        const aggregateData = (results as { aggregateData: Record<string, unknown> }).aggregateData;

        context.processedRecords =
            ((context.processedRecords as number) || 0) + (metricsUpdate.processed || 0);

        aggregateData.totalSynced =
            ((aggregateData.totalSynced as number) || 0) + (metricsUpdate.success || 0);
        aggregateData.totalFailed =
            ((aggregateData.totalFailed as number) || 0) + (metricsUpdate.errors || 0);

        if (metricsUpdate.errorDetails && metricsUpdate.errorDetails.length > 0) {
            aggregateData.errors = [
                ...((aggregateData.errors as Array<Record<string, unknown>>) || []),
                ...metricsUpdate.errorDetails,
            ].slice(-100);
        }

        const startTime = new Date(
            (context.startTime as string | number | Date) || (process.createdAt as Date)
        );
        const elapsed = Date.now() - startTime.getTime();
        aggregateData.duration = elapsed;

        if (elapsed > 0 && (context.processedRecords as number) > 0) {
            aggregateData.recordsPerSecond =
                (context.processedRecords as number) / (elapsed / 1000);
        } else {
            aggregateData.recordsPerSecond = 0;
        }

        if ((context.totalRecords as number) > 0 && (context.processedRecords as number) > 0) {
            const remaining = (context.totalRecords as number) - (context.processedRecords as number);
            if ((aggregateData.recordsPerSecond as number) > 0) {
                const etaMs = (remaining / (aggregateData.recordsPerSecond as number)) * 1000;
                const eta = new Date(Date.now() + etaMs);
                context.estimatedCompletion = eta.toISOString();
            }
        }

        const updates = {
            context,
            results,
        };

        let updatedProcess: ProcessRecord;
        try {
            updatedProcess = await this.processRepository.update(processId, updates);
        } catch (error: unknown) {
            const err = error as Error;
            throw new Error(`Failed to update process metrics: ${err.message}`);
        }

        if (this.websocketService) {
            await this._broadcastProgress(updatedProcess);
        }

        return updatedProcess;
    }

    private async _broadcastProgress(process: ProcessRecord): Promise<void> {
        try {
            const context: Record<string, unknown> = process.context || {};
            const results = process.results || { aggregateData: {} };
            const aggregateData = (results as { aggregateData?: Record<string, unknown> }).aggregateData || {};

            await this.websocketService!.broadcast({
                type: 'PROCESS_PROGRESS',
                data: {
                    processId: process.id,
                    processName: process.name,
                    processType: process.type,
                    state: process.state,
                    processed: context.processedRecords || 0,
                    total: context.totalRecords || 0,
                    successCount: aggregateData.totalSynced || 0,
                    errorCount: aggregateData.totalFailed || 0,
                    recordsPerSecond: aggregateData.recordsPerSecond || 0,
                    estimatedCompletion: context.estimatedCompletion || null,
                    timestamp: new Date().toISOString(),
                },
            });
        } catch (error) {
            console.error('Failed to broadcast process progress:', error);
        }
    }
}
