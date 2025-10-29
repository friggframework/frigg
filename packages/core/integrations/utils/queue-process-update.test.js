const { queueProcessUpdate } = require('./queue-process-update');
const { ProcessQueueService } = require('../services/process-queue-service');

// Mock the ProcessQueueService
jest.mock('../services/process-queue-service');

describe('queueProcessUpdate', () => {
    let mockQueueService;
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };

        // Create mock queue service
        mockQueueService = {
            queueStateUpdate: jest.fn().mockResolvedValue({ MessageId: 'msg-1' }),
            queueMetricsUpdate: jest.fn().mockResolvedValue({ MessageId: 'msg-2' }),
            queueProcessCompletion: jest.fn().mockResolvedValue({ MessageId: 'msg-3' }),
            queueErrorHandling: jest.fn().mockResolvedValue({ MessageId: 'msg-4' }),
        };

        ProcessQueueService.mockImplementation(() => mockQueueService);
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('when queue is enabled', () => {
        beforeEach(() => {
            process.env.PROCESS_QUEUE_ENABLED = 'true';
            process.env.PROCESS_MANAGEMENT_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789/process-management.fifo';
        });

        describe('queueStateUpdate', () => {
            it('should queue state update via ProcessQueueService', async () => {
                await queueProcessUpdate.queueStateUpdate(
                    'proc-123',
                    'RUNNING',
                    { step: 1 }
                );

                expect(mockQueueService.queueStateUpdate).toHaveBeenCalledWith(
                    'proc-123',
                    'RUNNING',
                    { step: 1 }
                );
            });

            it('should handle state update without context', async () => {
                await queueProcessUpdate.queueStateUpdate('proc-123', 'RUNNING');

                expect(mockQueueService.queueStateUpdate).toHaveBeenCalledWith(
                    'proc-123',
                    'RUNNING',
                    undefined
                );
            });
        });

        describe('queueMetricsUpdate', () => {
            it('should queue metrics update via ProcessQueueService', async () => {
                const metrics = { totalProcessed: 100 };

                await queueProcessUpdate.queueMetricsUpdate('proc-123', metrics);

                expect(mockQueueService.queueMetricsUpdate).toHaveBeenCalledWith(
                    'proc-123',
                    metrics
                );
            });
        });

        describe('queueProcessCompletion', () => {
            it('should queue process completion via ProcessQueueService', async () => {
                await queueProcessUpdate.queueProcessCompletion('proc-123');

                expect(mockQueueService.queueProcessCompletion).toHaveBeenCalledWith(
                    'proc-123'
                );
            });
        });

        describe('queueErrorHandling', () => {
            it('should queue error handling via ProcessQueueService', async () => {
                const error = new Error('Test error');

                await queueProcessUpdate.queueErrorHandling('proc-123', error);

                expect(mockQueueService.queueErrorHandling).toHaveBeenCalledWith(
                    'proc-123',
                    error
                );
            });
        });

        it('should initialize ProcessQueueService with queue URL', async () => {
            await queueProcessUpdate.queueStateUpdate('proc-123', 'RUNNING');

            expect(ProcessQueueService).toHaveBeenCalledWith({
                queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/process-management.fifo',
            });
        });

        it('should reuse ProcessQueueService instance', async () => {
            await queueProcessUpdate.queueStateUpdate('proc-123', 'RUNNING');
            await queueProcessUpdate.queueMetricsUpdate('proc-123', { count: 1 });

            // Should only create service once
            expect(ProcessQueueService).toHaveBeenCalledTimes(1);
        });
    });

    describe('when queue is disabled', () => {
        beforeEach(() => {
            process.env.PROCESS_QUEUE_ENABLED = 'false';
        });

        it('should return null for queueStateUpdate', async () => {
            const result = await queueProcessUpdate.queueStateUpdate(
                'proc-123',
                'RUNNING'
            );

            expect(result).toBeNull();
            expect(mockQueueService.queueStateUpdate).not.toHaveBeenCalled();
        });

        it('should return null for queueMetricsUpdate', async () => {
            const result = await queueProcessUpdate.queueMetricsUpdate(
                'proc-123',
                { count: 1 }
            );

            expect(result).toBeNull();
            expect(mockQueueService.queueMetricsUpdate).not.toHaveBeenCalled();
        });

        it('should return null for queueProcessCompletion', async () => {
            const result = await queueProcessUpdate.queueProcessCompletion('proc-123');

            expect(result).toBeNull();
            expect(mockQueueService.queueProcessCompletion).not.toHaveBeenCalled();
        });

        it('should return null for queueErrorHandling', async () => {
            const error = new Error('Test error');
            const result = await queueProcessUpdate.queueErrorHandling('proc-123', error);

            expect(result).toBeNull();
            expect(mockQueueService.queueErrorHandling).not.toHaveBeenCalled();
        });
    });

    describe('when queue environment variables are not set', () => {
        beforeEach(() => {
            delete process.env.PROCESS_QUEUE_ENABLED;
            delete process.env.PROCESS_MANAGEMENT_QUEUE_URL;
        });

        it('should treat as disabled when PROCESS_QUEUE_ENABLED is not set', async () => {
            const result = await queueProcessUpdate.queueStateUpdate(
                'proc-123',
                'RUNNING'
            );

            expect(result).toBeNull();
            expect(mockQueueService.queueStateUpdate).not.toHaveBeenCalled();
        });

        it('should throw error when enabled but queue URL is missing', async () => {
            process.env.PROCESS_QUEUE_ENABLED = 'true';

            await expect(
                queueProcessUpdate.queueStateUpdate('proc-123', 'RUNNING')
            ).rejects.toThrow(
                'PROCESS_MANAGEMENT_QUEUE_URL environment variable is required when process queue is enabled'
            );
        });
    });

    describe('isEnabled', () => {
        it('should return true when enabled', () => {
            process.env.PROCESS_QUEUE_ENABLED = 'true';
            expect(queueProcessUpdate.isEnabled()).toBe(true);
        });

        it('should return false when disabled', () => {
            process.env.PROCESS_QUEUE_ENABLED = 'false';
            expect(queueProcessUpdate.isEnabled()).toBe(false);
        });

        it('should return false when not set', () => {
            delete process.env.PROCESS_QUEUE_ENABLED;
            expect(queueProcessUpdate.isEnabled()).toBe(false);
        });

        it('should handle case-insensitive true values', () => {
            process.env.PROCESS_QUEUE_ENABLED = 'TRUE';
            expect(queueProcessUpdate.isEnabled()).toBe(true);

            process.env.PROCESS_QUEUE_ENABLED = 'True';
            expect(queueProcessUpdate.isEnabled()).toBe(true);
        });
    });

    describe('error handling', () => {
        beforeEach(() => {
            process.env.PROCESS_QUEUE_ENABLED = 'true';
            process.env.PROCESS_MANAGEMENT_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789/process-management.fifo';
        });

        it('should propagate errors from queueStateUpdate', async () => {
            mockQueueService.queueStateUpdate.mockRejectedValue(
                new Error('Queue error')
            );

            await expect(
                queueProcessUpdate.queueStateUpdate('proc-123', 'RUNNING')
            ).rejects.toThrow('Queue error');
        });

        it('should propagate errors from queueMetricsUpdate', async () => {
            mockQueueService.queueMetricsUpdate.mockRejectedValue(
                new Error('Queue error')
            );

            await expect(
                queueProcessUpdate.queueMetricsUpdate('proc-123', {})
            ).rejects.toThrow('Queue error');
        });

        it('should propagate errors from queueProcessCompletion', async () => {
            mockQueueService.queueProcessCompletion.mockRejectedValue(
                new Error('Queue error')
            );

            await expect(
                queueProcessUpdate.queueProcessCompletion('proc-123')
            ).rejects.toThrow('Queue error');
        });

        it('should propagate errors from queueErrorHandling', async () => {
            mockQueueService.queueErrorHandling.mockRejectedValue(
                new Error('Queue error')
            );

            const error = new Error('Test error');
            await expect(
                queueProcessUpdate.queueErrorHandling('proc-123', error)
            ).rejects.toThrow('Queue error');
        });
    });
});
