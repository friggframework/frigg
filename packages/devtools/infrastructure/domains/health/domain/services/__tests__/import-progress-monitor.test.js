/**
 * ImportProgressMonitor Tests
 *
 * TDD tests for monitoring CloudFormation import operation progress
 * Domain Layer - Service Tests
 *
 * Tests the import progress monitoring functionality that:
 * - Polls CloudFormation stack events during import
 * - Tracks progress per resource
 * - Detects failures and errors
 * - Handles timeout scenarios
 */

const { ImportProgressMonitor } = require('../import-progress-monitor');

describe('ImportProgressMonitor', () => {
  let monitor;
  let mockCloudFormationRepository;

  beforeEach(() => {
    // Enable fake timers for testing time-based polling
    jest.useFakeTimers();

    // Mock CloudFormation repository
    mockCloudFormationRepository = {
      getStackEvents: jest.fn(),
      getStackStatus: jest.fn(),
    };

    monitor = new ImportProgressMonitor({
      cloudFormationRepository: mockCloudFormationRepository,
    });
  });

  afterEach(() => {
    // Restore real timers
    jest.useRealTimers();
  });

  describe('monitorImport', () => {
    it('should monitor successful import and track progress for all resources', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'test-stack',
        region: 'us-east-1',
      };

      const resourceLogicalIds = ['FriggVPC', 'FriggPrivateSubnet1', 'FriggLambdaSecurityGroup'];

      const progressUpdates = [];
      const onProgress = jest.fn((progress) => {
        progressUpdates.push(progress);
      });

      // Mock stack events - simulate import progress over time
      let eventCallCount = 0;
      mockCloudFormationRepository.getStackEvents.mockImplementation(() => {
        eventCallCount++;

        // First poll: VPC import in progress
        if (eventCallCount === 1) {
          return Promise.resolve([
            {
              LogicalResourceId: 'FriggVPC',
              ResourceStatus: 'IMPORT_IN_PROGRESS',
              Timestamp: new Date('2025-10-27T10:00:01Z'),
            },
          ]);
        }

        // Second poll: VPC complete, Subnet in progress
        if (eventCallCount === 2) {
          return Promise.resolve([
            {
              LogicalResourceId: 'FriggVPC',
              ResourceStatus: 'IMPORT_COMPLETE',
              Timestamp: new Date('2025-10-27T10:00:05Z'),
            },
            {
              LogicalResourceId: 'FriggPrivateSubnet1',
              ResourceStatus: 'IMPORT_IN_PROGRESS',
              Timestamp: new Date('2025-10-27T10:00:06Z'),
            },
          ]);
        }

        // Third poll: Subnet complete, SecurityGroup in progress
        if (eventCallCount === 3) {
          return Promise.resolve([
            {
              LogicalResourceId: 'FriggPrivateSubnet1',
              ResourceStatus: 'IMPORT_COMPLETE',
              Timestamp: new Date('2025-10-27T10:00:10Z'),
            },
            {
              LogicalResourceId: 'FriggLambdaSecurityGroup',
              ResourceStatus: 'IMPORT_IN_PROGRESS',
              Timestamp: new Date('2025-10-27T10:00:11Z'),
            },
          ]);
        }

        // Fourth poll: All complete
        if (eventCallCount === 4) {
          return Promise.resolve([
            {
              LogicalResourceId: 'FriggLambdaSecurityGroup',
              ResourceStatus: 'IMPORT_COMPLETE',
              Timestamp: new Date('2025-10-27T10:00:15Z'),
            },
          ]);
        }

        return Promise.resolve([]);
      });

      mockCloudFormationRepository.getStackStatus.mockResolvedValue('IMPORT_COMPLETE');

      // Act
      const resultPromise = monitor.monitorImport({
        stackIdentifier,
        resourceLogicalIds,
        onProgress,
      });

      // Advance timers to trigger polling (4 polls * 2 seconds each)
      for (let i = 0; i < 4; i++) {
        await jest.advanceTimersByTimeAsync(2000);
      }

      const result = await resultPromise;

      // Assert
      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(3);
      expect(result.failedCount).toBe(0);
      expect(result.failedResources).toEqual([]);

      // Verify progress callbacks were called correctly
      expect(onProgress).toHaveBeenCalled();
      expect(progressUpdates.length).toBeGreaterThan(0);

      // Check that all resources were tracked
      const completedResources = progressUpdates.filter((p) => p.status === 'COMPLETE');
      expect(completedResources).toHaveLength(3);
      expect(completedResources.map((p) => p.logicalId)).toEqual(
        expect.arrayContaining(['FriggVPC', 'FriggPrivateSubnet1', 'FriggLambdaSecurityGroup'])
      );
    });

    it('should track progress with correct progress counts', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'test-stack',
        region: 'us-east-1',
      };

      const resourceLogicalIds = ['Resource1', 'Resource2'];

      const progressUpdates = [];
      const onProgress = jest.fn((progress) => {
        progressUpdates.push(progress);
      });

      let eventCallCount = 0;
      mockCloudFormationRepository.getStackEvents.mockImplementation(() => {
        eventCallCount++;

        if (eventCallCount === 1) {
          return Promise.resolve([
            {
              LogicalResourceId: 'Resource1',
              ResourceStatus: 'IMPORT_COMPLETE',
              Timestamp: new Date('2025-10-27T10:00:01Z'),
            },
          ]);
        }

        if (eventCallCount === 2) {
          return Promise.resolve([
            {
              LogicalResourceId: 'Resource2',
              ResourceStatus: 'IMPORT_COMPLETE',
              Timestamp: new Date('2025-10-27T10:00:03Z'),
            },
          ]);
        }

        return Promise.resolve([]);
      });

      mockCloudFormationRepository.getStackStatus.mockResolvedValue('IMPORT_COMPLETE');

      // Act
      const resultPromise = monitor.monitorImport({
        stackIdentifier,
        resourceLogicalIds,
        onProgress,
      });

      // Advance timers
      for (let i = 0; i < 2; i++) {
        await jest.advanceTimersByTimeAsync(2000);
      }

      await resultPromise;

      // Assert - check progress counts
      const resource1Progress = progressUpdates.find(
        (p) => p.logicalId === 'Resource1' && p.status === 'COMPLETE'
      );
      expect(resource1Progress).toEqual({
        logicalId: 'Resource1',
        status: 'COMPLETE',
        progress: 1,
        total: 2,
      });

      const resource2Progress = progressUpdates.find(
        (p) => p.logicalId === 'Resource2' && p.status === 'COMPLETE'
      );
      expect(resource2Progress).toEqual({
        logicalId: 'Resource2',
        status: 'COMPLETE',
        progress: 2,
        total: 2,
      });
    });

    it('should detect IMPORT_FAILED events and collect reasons', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'test-stack',
        region: 'us-east-1',
      };

      const resourceLogicalIds = ['FriggVPC', 'FriggPrivateSubnet1'];

      const progressUpdates = [];
      const onProgress = jest.fn((progress) => {
        progressUpdates.push(progress);
      });

      let eventCallCount = 0;
      mockCloudFormationRepository.getStackEvents.mockImplementation(() => {
        eventCallCount++;

        // First poll: VPC succeeds
        if (eventCallCount === 1) {
          return Promise.resolve([
            {
              LogicalResourceId: 'FriggVPC',
              ResourceStatus: 'IMPORT_COMPLETE',
              Timestamp: new Date('2025-10-27T10:00:01Z'),
            },
          ]);
        }

        // Second poll: Subnet fails
        if (eventCallCount === 2) {
          return Promise.resolve([
            {
              LogicalResourceId: 'FriggPrivateSubnet1',
              ResourceStatus: 'IMPORT_FAILED',
              ResourceStatusReason: 'Resource does not match template properties',
              Timestamp: new Date('2025-10-27T10:00:03Z'),
            },
          ]);
        }

        return Promise.resolve([]);
      });

      mockCloudFormationRepository.getStackStatus.mockResolvedValue('IMPORT_ROLLBACK_COMPLETE');

      // Act
      const resultPromise = monitor.monitorImport({
        stackIdentifier,
        resourceLogicalIds,
        onProgress,
      });

      // Advance timers
      for (let i = 0; i < 2; i++) {
        await jest.advanceTimersByTimeAsync(2000);
      }

      const result = await resultPromise;

      // Assert
      expect(result.success).toBe(false);
      expect(result.importedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.failedResources).toEqual([
        {
          logicalId: 'FriggPrivateSubnet1',
          reason: 'Resource does not match template properties',
        },
      ]);

      // Verify failure callback
      const failureUpdate = progressUpdates.find(
        (p) => p.logicalId === 'FriggPrivateSubnet1' && p.status === 'FAILED'
      );
      expect(failureUpdate).toEqual({
        logicalId: 'FriggPrivateSubnet1',
        status: 'FAILED',
        reason: 'Resource does not match template properties',
      });
    });

    it('should detect stack rollback (IMPORT_ROLLBACK_IN_PROGRESS)', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'test-stack',
        region: 'us-east-1',
      };

      const resourceLogicalIds = ['FriggVPC'];

      const onProgress = jest.fn();

      mockCloudFormationRepository.getStackEvents.mockResolvedValue([
        {
          LogicalResourceId: 'FriggVPC',
          ResourceStatus: 'IMPORT_IN_PROGRESS',
          Timestamp: new Date('2025-10-27T10:00:01Z'),
        },
      ]);

      mockCloudFormationRepository.getStackStatus.mockResolvedValue('IMPORT_ROLLBACK_IN_PROGRESS');

      // Act - start monitoring (don't await yet)
      const resultPromise = monitor.monitorImport({
        stackIdentifier,
        resourceLogicalIds,
        onProgress,
      });

      // Advance timer to trigger first poll (2 seconds)
      // This will call getStackEvents, then getStackStatus which returns IMPORT_ROLLBACK_IN_PROGRESS
      jest.advanceTimersByTime(2000);

      // Wait for promises to settle
      await Promise.resolve();
      await Promise.resolve();

      // Assert - expect rejection after rollback status detected
      await expect(resultPromise).rejects.toThrow('Import operation failed and rolled back');
    });

    it('should detect stack rollback (IMPORT_ROLLBACK_COMPLETE)', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'test-stack',
        region: 'us-east-1',
      };

      const resourceLogicalIds = ['FriggVPC'];

      const onProgress = jest.fn();

      mockCloudFormationRepository.getStackEvents.mockResolvedValue([
        {
          LogicalResourceId: 'FriggVPC',
          ResourceStatus: 'IMPORT_FAILED',
          ResourceStatusReason: 'Template mismatch',
          Timestamp: new Date('2025-10-27T10:00:01Z'),
        },
      ]);

      mockCloudFormationRepository.getStackStatus.mockResolvedValue('IMPORT_ROLLBACK_COMPLETE');

      // Act - start monitoring (don't await yet)
      const resultPromise = monitor.monitorImport({
        stackIdentifier,
        resourceLogicalIds,
        onProgress,
      });

      // Advance timer to trigger first poll (2 seconds)
      // This will process IMPORT_FAILED event, exit loop, then check final status
      jest.advanceTimersByTime(2000);

      // Wait for promises to settle
      await Promise.resolve();
      await Promise.resolve();

      // Assert - expect rejection (complete failure: 0 imported, 1 failed)
      await expect(resultPromise).rejects.toThrow('Import operation failed and rolled back');
    });

    it('should timeout after 5 minutes', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'test-stack',
        region: 'us-east-1',
      };

      const resourceLogicalIds = ['FriggVPC'];

      const onProgress = jest.fn();

      // Mock events that never complete
      mockCloudFormationRepository.getStackEvents.mockResolvedValue([
        {
          LogicalResourceId: 'FriggVPC',
          ResourceStatus: 'IMPORT_IN_PROGRESS',
          Timestamp: new Date('2025-10-27T10:00:01Z'),
        },
      ]);

      mockCloudFormationRepository.getStackStatus.mockResolvedValue('IMPORT_IN_PROGRESS');

      // Act & Assert - wrap in expect().rejects to properly handle async rejection
      await expect(
        (async () => {
          const resultPromise = monitor.monitorImport({
            stackIdentifier,
            resourceLogicalIds,
            onProgress,
          });

          // Advance timers beyond 5 minutes (300,000ms) in chunks
          // Simulate 151 polls (302 seconds = 302,000ms) to exceed timeout
          for (let i = 0; i < 151; i++) {
            await jest.advanceTimersByTimeAsync(2000);
          }

          return await resultPromise;
        })()
      ).rejects.toThrow('Import operation timed out');
    });

    it('should filter events by resourceLogicalIds', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'test-stack',
        region: 'us-east-1',
      };

      const resourceLogicalIds = ['FriggVPC', 'FriggPrivateSubnet1'];

      const progressUpdates = [];
      const onProgress = jest.fn((progress) => {
        progressUpdates.push(progress);
      });

      let eventCallCount = 0;
      mockCloudFormationRepository.getStackEvents.mockImplementation(() => {
        eventCallCount++;

        if (eventCallCount === 1) {
          return Promise.resolve([
            {
              LogicalResourceId: 'FriggVPC',
              ResourceStatus: 'IMPORT_COMPLETE',
              Timestamp: new Date('2025-10-27T10:00:01Z'),
            },
            {
              LogicalResourceId: 'OtherResource', // Not in resourceLogicalIds
              ResourceStatus: 'IMPORT_COMPLETE',
              Timestamp: new Date('2025-10-27T10:00:02Z'),
            },
            {
              LogicalResourceId: 'FriggPrivateSubnet1',
              ResourceStatus: 'IMPORT_COMPLETE',
              Timestamp: new Date('2025-10-27T10:00:03Z'),
            },
          ]);
        }

        return Promise.resolve([]);
      });

      mockCloudFormationRepository.getStackStatus.mockResolvedValue('IMPORT_COMPLETE');

      // Act
      const resultPromise = monitor.monitorImport({
        stackIdentifier,
        resourceLogicalIds,
        onProgress,
      });

      // Advance timer
      await jest.advanceTimersByTimeAsync(2000);

      const result = await resultPromise;

      // Assert
      expect(result.importedCount).toBe(2);
      expect(progressUpdates.every((p) => resourceLogicalIds.includes(p.logicalId))).toBe(true);
      expect(progressUpdates.some((p) => p.logicalId === 'OtherResource')).toBe(false);
    });

    it('should sort events by timestamp (oldest first)', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'test-stack',
        region: 'us-east-1',
      };

      const resourceLogicalIds = ['Resource1', 'Resource2', 'Resource3'];

      const progressUpdates = [];
      const onProgress = jest.fn((progress) => {
        progressUpdates.push(progress);
      });

      // Return events in unsorted order
      mockCloudFormationRepository.getStackEvents.mockResolvedValue([
        {
          LogicalResourceId: 'Resource3',
          ResourceStatus: 'IMPORT_COMPLETE',
          Timestamp: new Date('2025-10-27T10:00:03Z'),
        },
        {
          LogicalResourceId: 'Resource1',
          ResourceStatus: 'IMPORT_COMPLETE',
          Timestamp: new Date('2025-10-27T10:00:01Z'),
        },
        {
          LogicalResourceId: 'Resource2',
          ResourceStatus: 'IMPORT_COMPLETE',
          Timestamp: new Date('2025-10-27T10:00:02Z'),
        },
      ]);

      mockCloudFormationRepository.getStackStatus.mockResolvedValue('IMPORT_COMPLETE');

      // Act
      const resultPromise = monitor.monitorImport({
        stackIdentifier,
        resourceLogicalIds,
        onProgress,
      });

      // Advance timer
      await jest.advanceTimersByTimeAsync(2000);

      const result = await resultPromise;

      // Assert
      expect(result.importedCount).toBe(3);

      // Progress updates should be in timestamp order
      const completeUpdates = progressUpdates.filter((p) => p.status === 'COMPLETE');
      expect(completeUpdates.map((p) => p.logicalId)).toEqual([
        'Resource1',
        'Resource2',
        'Resource3',
      ]);
    });

    it('should handle IMPORT_IN_PROGRESS status with progress callbacks', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'test-stack',
        region: 'us-east-1',
      };

      const resourceLogicalIds = ['FriggVPC'];

      const progressUpdates = [];
      const onProgress = jest.fn((progress) => {
        progressUpdates.push(progress);
      });

      let eventCallCount = 0;
      mockCloudFormationRepository.getStackEvents.mockImplementation(() => {
        eventCallCount++;

        if (eventCallCount === 1) {
          return Promise.resolve([
            {
              LogicalResourceId: 'FriggVPC',
              ResourceStatus: 'IMPORT_IN_PROGRESS',
              Timestamp: new Date('2025-10-27T10:00:01Z'),
            },
          ]);
        }

        if (eventCallCount === 2) {
          return Promise.resolve([
            {
              LogicalResourceId: 'FriggVPC',
              ResourceStatus: 'IMPORT_COMPLETE',
              Timestamp: new Date('2025-10-27T10:00:05Z'),
            },
          ]);
        }

        return Promise.resolve([]);
      });

      mockCloudFormationRepository.getStackStatus.mockResolvedValue('IMPORT_COMPLETE');

      // Act
      const resultPromise = monitor.monitorImport({
        stackIdentifier,
        resourceLogicalIds,
        onProgress,
      });

      // Advance timers
      for (let i = 0; i < 2; i++) {
        await jest.advanceTimersByTimeAsync(2000);
      }

      await resultPromise;

      // Assert
      expect(progressUpdates.some((p) => p.status === 'IN_PROGRESS')).toBe(true);

      const inProgressUpdate = progressUpdates.find(
        (p) => p.logicalId === 'FriggVPC' && p.status === 'IN_PROGRESS'
      );
      expect(inProgressUpdate).toEqual({
        logicalId: 'FriggVPC',
        status: 'IN_PROGRESS',
      });
    });

    it('should poll stack events every 2 seconds', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'test-stack',
        region: 'us-east-1',
      };

      const resourceLogicalIds = ['FriggVPC'];

      const onProgress = jest.fn();

      let eventCallCount = 0;
      mockCloudFormationRepository.getStackEvents.mockImplementation(() => {
        eventCallCount++;

        if (eventCallCount === 3) {
          return Promise.resolve([
            {
              LogicalResourceId: 'FriggVPC',
              ResourceStatus: 'IMPORT_COMPLETE',
              Timestamp: new Date('2025-10-27T10:00:06Z'),
            },
          ]);
        }

        return Promise.resolve([
          {
            LogicalResourceId: 'FriggVPC',
            ResourceStatus: 'IMPORT_IN_PROGRESS',
            Timestamp: new Date('2025-10-27T10:00:01Z'),
          },
        ]);
      });

      mockCloudFormationRepository.getStackStatus.mockResolvedValue('IMPORT_IN_PROGRESS');

      // Act
      const resultPromise = monitor.monitorImport({
        stackIdentifier,
        resourceLogicalIds,
        onProgress,
      });

      // Advance timers 3 times (3 * 2 seconds = 6 seconds)
      for (let i = 0; i < 3; i++) {
        await jest.advanceTimersByTimeAsync(2000);
      }

      await resultPromise;

      // Assert - getStackEvents should be called 3 times (once per 2-second interval)
      expect(mockCloudFormationRepository.getStackEvents).toHaveBeenCalledTimes(3);
    });

    it('should handle empty progress callback gracefully', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'test-stack',
        region: 'us-east-1',
      };

      const resourceLogicalIds = ['FriggVPC'];

      mockCloudFormationRepository.getStackEvents.mockResolvedValue([
        {
          LogicalResourceId: 'FriggVPC',
          ResourceStatus: 'IMPORT_COMPLETE',
          Timestamp: new Date('2025-10-27T10:00:01Z'),
        },
      ]);

      mockCloudFormationRepository.getStackStatus.mockResolvedValue('IMPORT_COMPLETE');

      // Act - No onProgress callback provided
      const resultPromise = monitor.monitorImport({
        stackIdentifier,
        resourceLogicalIds,
        onProgress: null,
      });

      // Advance timer
      await jest.advanceTimersByTimeAsync(2000);

      const result = await resultPromise;

      // Assert - should complete successfully without callback
      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(1);
    });

    it('should handle multiple failures for different resources', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'test-stack',
        region: 'us-east-1',
      };

      const resourceLogicalIds = ['Resource1', 'Resource2', 'Resource3'];

      const onProgress = jest.fn();

      mockCloudFormationRepository.getStackEvents.mockResolvedValue([
        {
          LogicalResourceId: 'Resource1',
          ResourceStatus: 'IMPORT_FAILED',
          ResourceStatusReason: 'Template mismatch for Resource1',
          Timestamp: new Date('2025-10-27T10:00:01Z'),
        },
        {
          LogicalResourceId: 'Resource2',
          ResourceStatus: 'IMPORT_COMPLETE',
          Timestamp: new Date('2025-10-27T10:00:02Z'),
        },
        {
          LogicalResourceId: 'Resource3',
          ResourceStatus: 'IMPORT_FAILED',
          ResourceStatusReason: 'Resource3 not found',
          Timestamp: new Date('2025-10-27T10:00:03Z'),
        },
      ]);

      mockCloudFormationRepository.getStackStatus.mockResolvedValue('IMPORT_ROLLBACK_COMPLETE');

      // Act
      const resultPromise = monitor.monitorImport({
        stackIdentifier,
        resourceLogicalIds,
        onProgress,
      });

      // Advance timer
      await jest.advanceTimersByTimeAsync(2000);

      const result = await resultPromise;

      // Assert
      expect(result.success).toBe(false);
      expect(result.importedCount).toBe(1);
      expect(result.failedCount).toBe(2);
      expect(result.failedResources).toEqual([
        {
          logicalId: 'Resource1',
          reason: 'Template mismatch for Resource1',
        },
        {
          logicalId: 'Resource3',
          reason: 'Resource3 not found',
        },
      ]);
    });

    it('should recognize UPDATE_COMPLETE as successful import (tagging phase)', async () => {
      // Arrange
      // This test validates the fix for the timeout bug where resources
      // successfully import (IMPORT_COMPLETE) but then CloudFormation
      // applies stack-level tags (UPDATE_COMPLETE), and the monitor
      // must recognize UPDATE_COMPLETE as a completion status.
      const stackIdentifier = {
        stackName: 'test-stack',
        region: 'us-east-1',
      };

      const resourceLogicalIds = ['FriggVPC', 'FriggPrivateSubnet1'];

      const progressUpdates = [];
      const onProgress = jest.fn((progress) => {
        progressUpdates.push(progress);
      });

      let eventCallCount = 0;
      mockCloudFormationRepository.getStackEvents.mockImplementation(() => {
        eventCallCount++;

        // First poll: Import phase complete
        if (eventCallCount === 1) {
          return Promise.resolve([
            {
              LogicalResourceId: 'FriggVPC',
              ResourceStatus: 'IMPORT_COMPLETE',
              Timestamp: new Date('2025-10-27T10:00:01Z'),
            },
            {
              LogicalResourceId: 'FriggPrivateSubnet1',
              ResourceStatus: 'IMPORT_COMPLETE',
              Timestamp: new Date('2025-10-27T10:00:02Z'),
            },
          ]);
        }

        // Second poll: Tagging phase (UPDATE_COMPLETE)
        // This is the real-world sequence from CloudFormation
        if (eventCallCount === 2) {
          return Promise.resolve([
            {
              LogicalResourceId: 'FriggVPC',
              ResourceStatus: 'UPDATE_COMPLETE',
              Timestamp: new Date('2025-10-27T10:00:03Z'),
            },
            {
              LogicalResourceId: 'FriggPrivateSubnet1',
              ResourceStatus: 'UPDATE_COMPLETE',
              Timestamp: new Date('2025-10-27T10:00:04Z'),
            },
          ]);
        }

        return Promise.resolve([]);
      });

      mockCloudFormationRepository.getStackStatus.mockResolvedValue('IMPORT_COMPLETE');

      // Act
      const resultPromise = monitor.monitorImport({
        stackIdentifier,
        resourceLogicalIds,
        onProgress,
      });

      // Advance timers for 2 polls
      for (let i = 0; i < 2; i++) {
        await jest.advanceTimersByTimeAsync(2000);
      }

      const result = await resultPromise;

      // Assert
      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(2);
      expect(result.failedCount).toBe(0);

      // Verify both resources reached COMPLETE status
      const completeUpdates = progressUpdates.filter((p) => p.status === 'COMPLETE');
      expect(completeUpdates).toHaveLength(2);
      expect(completeUpdates.map((p) => p.logicalId)).toEqual(
        expect.arrayContaining(['FriggVPC', 'FriggPrivateSubnet1'])
      );
    });

    it('should handle real CloudFormation event sequence (IMPORT_COMPLETE then UPDATE_COMPLETE)', async () => {
      // Arrange
      // This test simulates the EXACT event sequence from real CloudFormation:
      // 1. IMPORT_IN_PROGRESS
      // 2. IMPORT_COMPLETE (resource imported)
      // 3. UPDATE_IN_PROGRESS (tagging starts)
      // 4. UPDATE_COMPLETE (tagging complete)
      const stackIdentifier = {
        stackName: 'test-stack',
        region: 'us-east-1',
      };

      const resourceLogicalIds = ['FriggVPC'];

      const progressUpdates = [];
      const onProgress = jest.fn((progress) => {
        progressUpdates.push(progress);
      });

      let eventCallCount = 0;
      mockCloudFormationRepository.getStackEvents.mockImplementation(() => {
        eventCallCount++;

        // First poll: Import in progress
        if (eventCallCount === 1) {
          return Promise.resolve([
            {
              LogicalResourceId: 'FriggVPC',
              ResourceStatus: 'IMPORT_IN_PROGRESS',
              Timestamp: new Date('2025-10-27T16:10:30Z'),
            },
          ]);
        }

        // Second poll: Import complete
        if (eventCallCount === 2) {
          return Promise.resolve([
            {
              LogicalResourceId: 'FriggVPC',
              ResourceStatus: 'IMPORT_COMPLETE',
              Timestamp: new Date('2025-10-27T16:10:34Z'),
            },
          ]);
        }

        // Third poll: Update in progress (tagging)
        if (eventCallCount === 3) {
          return Promise.resolve([
            {
              LogicalResourceId: 'FriggVPC',
              ResourceStatus: 'UPDATE_IN_PROGRESS',
              Timestamp: new Date('2025-10-27T16:10:35Z'),
            },
          ]);
        }

        // Fourth poll: Update complete (tagging done)
        if (eventCallCount === 4) {
          return Promise.resolve([
            {
              LogicalResourceId: 'FriggVPC',
              ResourceStatus: 'UPDATE_COMPLETE',
              Timestamp: new Date('2025-10-27T16:10:36Z'),
            },
          ]);
        }

        return Promise.resolve([]);
      });

      mockCloudFormationRepository.getStackStatus.mockResolvedValue('IMPORT_COMPLETE');

      // Act
      const resultPromise = monitor.monitorImport({
        stackIdentifier,
        resourceLogicalIds,
        onProgress,
      });

      // Advance timers for 4 polls (real sequence takes ~6 seconds)
      for (let i = 0; i < 4; i++) {
        await jest.advanceTimersByTimeAsync(2000);
      }

      const result = await resultPromise;

      // Assert
      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(1);
      expect(result.failedCount).toBe(0);

      // Verify progress callbacks captured full sequence
      expect(progressUpdates.length).toBeGreaterThanOrEqual(2);

      // Should have IN_PROGRESS callback
      const inProgressUpdate = progressUpdates.find(
        (p) => p.logicalId === 'FriggVPC' && p.status === 'IN_PROGRESS'
      );
      expect(inProgressUpdate).toBeDefined();

      // Should have COMPLETE callback (from either IMPORT_COMPLETE or UPDATE_COMPLETE)
      const completeUpdate = progressUpdates.find(
        (p) => p.logicalId === 'FriggVPC' && p.status === 'COMPLETE'
      );
      expect(completeUpdate).toBeDefined();
      expect(completeUpdate.progress).toBe(1);
      expect(completeUpdate.total).toBe(1);
    });
  });
});
