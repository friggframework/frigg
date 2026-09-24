/**
 * UpdateProgressMonitor Tests
 *
 * TDD tests for monitoring CloudFormation UPDATE operations
 */

const { UpdateProgressMonitor } = require('../update-progress-monitor');
const StackIdentifier = require('../../../domain/value-objects/stack-identifier');

// Mock timers for testing delays and timeouts
jest.useFakeTimers();

describe('UpdateProgressMonitor', () => {
    let monitor;
    let mockCFRepo;
    let onProgressCallback;

    beforeEach(() => {
        // Reset mock CloudFormation repository
        mockCFRepo = {
            getStackEvents: jest.fn(),
            getStackStatus: jest.fn(),
        };

        // Reset progress callback
        onProgressCallback = jest.fn();

        // Create monitor instance
        monitor = new UpdateProgressMonitor({
            cloudFormationRepository: mockCFRepo,
        });

        // Clear all timers
        jest.clearAllTimers();
    });

    afterEach(() => {
        jest.clearAllTimers();
    });

    describe('constructor', () => {
        it('should require cloudFormationRepository', () => {
            expect(() => new UpdateProgressMonitor({})).toThrow(
                'cloudFormationRepository is required'
            );
        });

        it('should create instance with valid dependencies', () => {
            const monitor = new UpdateProgressMonitor({
                cloudFormationRepository: mockCFRepo,
            });
            expect(monitor).toBeInstanceOf(UpdateProgressMonitor);
        });
    });

    describe('monitorUpdate - successful update', () => {
        it('should monitor single resource update to completion', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'test-stack',
                region: 'us-east-1',
            });

            const resourceLogicalIds = ['AttioLambdaFunction'];

            // Mock stack events sequence
            mockCFRepo.getStackEvents
                // First poll: UPDATE_IN_PROGRESS
                .mockResolvedValueOnce([
                    {
                        LogicalResourceId: 'AttioLambdaFunction',
                        ResourceStatus: 'UPDATE_IN_PROGRESS',
                        Timestamp: new Date('2025-01-01T00:00:01Z'),
                    },
                ])
                // Second poll: UPDATE_COMPLETE
                .mockResolvedValueOnce([
                    {
                        LogicalResourceId: 'AttioLambdaFunction',
                        ResourceStatus: 'UPDATE_IN_PROGRESS',
                        Timestamp: new Date('2025-01-01T00:00:01Z'),
                    },
                    {
                        LogicalResourceId: 'AttioLambdaFunction',
                        ResourceStatus: 'UPDATE_COMPLETE',
                        Timestamp: new Date('2025-01-01T00:00:05Z'),
                    },
                ]);

            // Mock stack status
            mockCFRepo.getStackStatus.mockResolvedValue('UPDATE_COMPLETE');

            // Start monitoring in background
            const monitorPromise = monitor.monitorUpdate({
                stackIdentifier,
                resourceLogicalIds,
                onProgress: onProgressCallback,
            });

            // Advance timers to trigger first poll (2 seconds)
            await jest.advanceTimersByTimeAsync(2000);

            // Advance timers to trigger second poll (2 more seconds)
            await jest.advanceTimersByTimeAsync(2000);

            // Wait for monitoring to complete
            const result = await monitorPromise;

            // Verify result
            expect(result.success).toBe(true);
            expect(result.updatedCount).toBe(1);
            expect(result.failedCount).toBe(0);

            // Verify progress callbacks
            expect(onProgressCallback).toHaveBeenCalledWith({
                logicalId: 'AttioLambdaFunction',
                status: 'IN_PROGRESS',
            });
            expect(onProgressCallback).toHaveBeenCalledWith({
                logicalId: 'AttioLambdaFunction',
                status: 'COMPLETE',
                progress: 1,
                total: 1,
            });
        });

        it('should monitor multiple resources updating simultaneously', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'test-stack',
                region: 'us-east-1',
            });

            const resourceLogicalIds = [
                'AttioLambdaFunction',
                'PipedriveLambdaFunction',
                'ZohoCrmLambdaFunction',
            ];

            // Mock stack events - all resources update together
            mockCFRepo.getStackEvents
                // First poll: All IN_PROGRESS
                .mockResolvedValueOnce([
                    {
                        LogicalResourceId: 'AttioLambdaFunction',
                        ResourceStatus: 'UPDATE_IN_PROGRESS',
                        Timestamp: new Date('2025-01-01T00:00:01Z'),
                    },
                    {
                        LogicalResourceId: 'PipedriveLambdaFunction',
                        ResourceStatus: 'UPDATE_IN_PROGRESS',
                        Timestamp: new Date('2025-01-01T00:00:02Z'),
                    },
                    {
                        LogicalResourceId: 'ZohoCrmLambdaFunction',
                        ResourceStatus: 'UPDATE_IN_PROGRESS',
                        Timestamp: new Date('2025-01-01T00:00:03Z'),
                    },
                ])
                // Second poll: First complete
                .mockResolvedValueOnce([
                    {
                        LogicalResourceId: 'AttioLambdaFunction',
                        ResourceStatus: 'UPDATE_IN_PROGRESS',
                        Timestamp: new Date('2025-01-01T00:00:01Z'),
                    },
                    {
                        LogicalResourceId: 'AttioLambdaFunction',
                        ResourceStatus: 'UPDATE_COMPLETE',
                        Timestamp: new Date('2025-01-01T00:00:10Z'),
                    },
                    {
                        LogicalResourceId: 'PipedriveLambdaFunction',
                        ResourceStatus: 'UPDATE_IN_PROGRESS',
                        Timestamp: new Date('2025-01-01T00:00:02Z'),
                    },
                    {
                        LogicalResourceId: 'ZohoCrmLambdaFunction',
                        ResourceStatus: 'UPDATE_IN_PROGRESS',
                        Timestamp: new Date('2025-01-01T00:00:03Z'),
                    },
                ])
                // Third poll: All complete
                .mockResolvedValueOnce([
                    {
                        LogicalResourceId: 'AttioLambdaFunction',
                        ResourceStatus: 'UPDATE_COMPLETE',
                        Timestamp: new Date('2025-01-01T00:00:10Z'),
                    },
                    {
                        LogicalResourceId: 'PipedriveLambdaFunction',
                        ResourceStatus: 'UPDATE_COMPLETE',
                        Timestamp: new Date('2025-01-01T00:00:11Z'),
                    },
                    {
                        LogicalResourceId: 'ZohoCrmLambdaFunction',
                        ResourceStatus: 'UPDATE_COMPLETE',
                        Timestamp: new Date('2025-01-01T00:00:12Z'),
                    },
                ]);

            mockCFRepo.getStackStatus.mockResolvedValue('UPDATE_COMPLETE');

            const monitorPromise = monitor.monitorUpdate({
                stackIdentifier,
                resourceLogicalIds,
                onProgress: onProgressCallback,
            });

            // Advance through polling intervals
            await jest.advanceTimersByTimeAsync(2000);
            await jest.advanceTimersByTimeAsync(2000);
            await jest.advanceTimersByTimeAsync(2000);

            const result = await monitorPromise;

            expect(result.success).toBe(true);
            expect(result.updatedCount).toBe(3);
            expect(result.failedCount).toBe(0);
        });
    });

    describe('monitorUpdate - failed updates', () => {
        it('should detect and report UPDATE_FAILED resources', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'test-stack',
                region: 'us-east-1',
            });

            const resourceLogicalIds = ['AttioLambdaFunction'];

            mockCFRepo.getStackEvents
                .mockResolvedValueOnce([
                    {
                        LogicalResourceId: 'AttioLambdaFunction',
                        ResourceStatus: 'UPDATE_IN_PROGRESS',
                        Timestamp: new Date('2025-01-01T00:00:01Z'),
                    },
                ])
                .mockResolvedValueOnce([
                    {
                        LogicalResourceId: 'AttioLambdaFunction',
                        ResourceStatus: 'UPDATE_IN_PROGRESS',
                        Timestamp: new Date('2025-01-01T00:00:01Z'),
                    },
                    {
                        LogicalResourceId: 'AttioLambdaFunction',
                        ResourceStatus: 'UPDATE_FAILED',
                        ResourceStatusReason: 'Subnet does not exist: subnet-invalid',
                        Timestamp: new Date('2025-01-01T00:00:05Z'),
                    },
                ]);

            mockCFRepo.getStackStatus.mockResolvedValue('UPDATE_ROLLBACK_COMPLETE');

            const monitorPromise = monitor.monitorUpdate({
                stackIdentifier,
                resourceLogicalIds,
                onProgress: onProgressCallback,
            });

            await jest.advanceTimersByTimeAsync(2000);
            await jest.advanceTimersByTimeAsync(2000);

            const result = await monitorPromise;

            expect(result.success).toBe(false);
            expect(result.updatedCount).toBe(0);
            expect(result.failedCount).toBe(1);
            expect(result.failedResources).toHaveLength(1);
            expect(result.failedResources[0].logicalId).toBe('AttioLambdaFunction');
            expect(result.failedResources[0].reason).toBe('Subnet does not exist: subnet-invalid');

            // Verify FAILED callback was triggered
            expect(onProgressCallback).toHaveBeenCalledWith({
                logicalId: 'AttioLambdaFunction',
                status: 'FAILED',
                reason: 'Subnet does not exist: subnet-invalid',
            });
        });

        it('should detect stack rollback during update', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'test-stack',
                region: 'us-east-1',
            });

            const resourceLogicalIds = ['AttioLambdaFunction'];

            mockCFRepo.getStackEvents.mockResolvedValue([
                {
                    LogicalResourceId: 'AttioLambdaFunction',
                    ResourceStatus: 'UPDATE_IN_PROGRESS',
                    Timestamp: new Date('2025-01-01T00:00:01Z'),
                },
            ]);

            // Stack status shows rollback in progress
            mockCFRepo.getStackStatus.mockResolvedValue('UPDATE_ROLLBACK_IN_PROGRESS');

            const monitorPromise = monitor.monitorUpdate({
                stackIdentifier,
                resourceLogicalIds,
                onProgress: onProgressCallback,
            });

            await jest.advanceTimersByTimeAsync(2000);

            await expect(monitorPromise).rejects.toThrow('Update operation failed and rolled back');
        });
    });

    describe('monitorUpdate - timeout handling', () => {
        it('should timeout after 5 minutes', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'test-stack',
                region: 'us-east-1',
            });

            const resourceLogicalIds = ['AttioLambdaFunction'];

            // Mock events that never complete
            mockCFRepo.getStackEvents.mockResolvedValue([
                {
                    LogicalResourceId: 'AttioLambdaFunction',
                    ResourceStatus: 'UPDATE_IN_PROGRESS',
                    Timestamp: new Date('2025-01-01T00:00:01Z'),
                },
            ]);

            mockCFRepo.getStackStatus.mockResolvedValue('UPDATE_IN_PROGRESS');

            const monitorPromise = monitor.monitorUpdate({
                stackIdentifier,
                resourceLogicalIds,
                onProgress: onProgressCallback,
            });

            // Advance past 5 minute timeout (300000ms)
            await jest.advanceTimersByTimeAsync(300000 + 2000);

            await expect(monitorPromise).rejects.toThrow('Update operation timed out');
        });
    });

    describe('monitorUpdate - event deduplication', () => {
        it('should not process duplicate events', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'test-stack',
                region: 'us-east-1',
            });

            const resourceLogicalIds = ['AttioLambdaFunction'];

            // Mock duplicate events (same timestamp + logicalId + status)
            mockCFRepo.getStackEvents
                .mockResolvedValueOnce([
                    {
                        LogicalResourceId: 'AttioLambdaFunction',
                        ResourceStatus: 'UPDATE_IN_PROGRESS',
                        Timestamp: new Date('2025-01-01T00:00:01Z'),
                    },
                ])
                .mockResolvedValueOnce([
                    // Duplicate event
                    {
                        LogicalResourceId: 'AttioLambdaFunction',
                        ResourceStatus: 'UPDATE_IN_PROGRESS',
                        Timestamp: new Date('2025-01-01T00:00:01Z'),
                    },
                    // New event
                    {
                        LogicalResourceId: 'AttioLambdaFunction',
                        ResourceStatus: 'UPDATE_COMPLETE',
                        Timestamp: new Date('2025-01-01T00:00:05Z'),
                    },
                ]);

            mockCFRepo.getStackStatus.mockResolvedValue('UPDATE_COMPLETE');

            const monitorPromise = monitor.monitorUpdate({
                stackIdentifier,
                resourceLogicalIds,
                onProgress: onProgressCallback,
            });

            await jest.advanceTimersByTimeAsync(2000);
            await jest.advanceTimersByTimeAsync(2000);

            await monitorPromise;

            // IN_PROGRESS callback should only be called once (not twice for duplicate)
            const inProgressCalls = onProgressCallback.mock.calls.filter(
                (call) => call[0].status === 'IN_PROGRESS'
            );
            expect(inProgressCalls).toHaveLength(1);
        });
    });

    describe('monitorUpdate - no resources to track', () => {
        it('should return immediately if no resources to track', async () => {
            const stackIdentifier = new StackIdentifier({
                stackName: 'test-stack',
                region: 'us-east-1',
            });

            const result = await monitor.monitorUpdate({
                stackIdentifier,
                resourceLogicalIds: [],
                onProgress: onProgressCallback,
            });

            expect(result.success).toBe(true);
            expect(result.updatedCount).toBe(0);
            expect(result.failedCount).toBe(0);

            // Should not have polled CloudFormation
            expect(mockCFRepo.getStackEvents).not.toHaveBeenCalled();
        });
    });
});
