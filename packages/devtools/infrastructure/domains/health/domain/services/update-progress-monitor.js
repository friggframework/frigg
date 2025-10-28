/**
 * UpdateProgressMonitor - Monitor CloudFormation Update Operation Progress
 *
 * Domain Layer - Service
 *
 * Monitors CloudFormation UPDATE operations by polling stack events and tracking
 * resource update progress. Provides real-time progress callbacks and detects
 * failures, rollbacks, and timeouts.
 *
 * Responsibilities:
 * - Poll CloudFormation stack events during update
 * - Track progress per resource (IN_PROGRESS, COMPLETE, FAILED)
 * - Detect stack rollback states
 * - Timeout after 5 minutes
 * - Provide progress callbacks for UI updates
 */

class UpdateProgressMonitor {
  /**
   * Create progress monitor with CloudFormation repository dependency
   *
   * @param {Object} params
   * @param {Object} params.cloudFormationRepository - CloudFormation operations
   */
  constructor({ cloudFormationRepository }) {
    if (!cloudFormationRepository) {
      throw new Error('cloudFormationRepository is required');
    }
    this.cfRepo = cloudFormationRepository;
  }

  /**
   * Monitor update operation progress
   *
   * Polls CloudFormation stack events every 2 seconds to track resource update progress.
   * Calls onProgress callback with status updates for each resource.
   * Detects failures, rollbacks, and timeouts.
   *
   * @param {Object} params
   * @param {Object} params.stackIdentifier - Stack identifier { stackName, region }
   * @param {Array<string>} params.resourceLogicalIds - Logical IDs to track
   * @param {Function} params.onProgress - Progress callback function
   * @returns {Promise<Object>} Update result
   */
  async monitorUpdate({ stackIdentifier, resourceLogicalIds, onProgress }) {
    // If no resources to track, return immediately
    if (!resourceLogicalIds || resourceLogicalIds.length === 0) {
      return {
        success: true,
        updatedCount: 0,
        failedCount: 0,
        failedResources: [],
      };
    }

    const updatedResources = new Set();
    const failedResources = [];
    const processedEvents = new Set(); // Track processed events by timestamp + logicalId
    let elapsedTime = 0; // Track elapsed time manually for fake timers compatibility
    const TIMEOUT_MS = 300000; // 5 minutes
    const POLL_INTERVAL_MS = 2000; // 2 seconds

    // Continue polling until all resources are complete or failed
    while (
      updatedResources.size + failedResources.length <
      resourceLogicalIds.length
    ) {
      // Wait 2 seconds before polling
      await this._delay(POLL_INTERVAL_MS);
      elapsedTime += POLL_INTERVAL_MS;

      // Check for timeout
      if (elapsedTime > TIMEOUT_MS) {
        throw new Error('Update operation timed out');
      }

      // Get stack events
      const events = await this.cfRepo.getStackEvents({
        stackIdentifier,
      });

      // Sort events by timestamp (oldest first) for consistent processing
      const sortedEvents = [...events].sort(
        (a, b) => new Date(a.Timestamp) - new Date(b.Timestamp)
      );

      // Process events for tracked resources
      for (const event of sortedEvents) {
        const logicalId = event.LogicalResourceId;

        // Skip if not a tracked resource
        if (!resourceLogicalIds.includes(logicalId)) {
          continue;
        }

        // Create unique event key to avoid duplicate processing
        const eventKey = `${event.Timestamp.toISOString()}_${logicalId}_${event.ResourceStatus}`;

        // Skip if already processed
        if (processedEvents.has(eventKey)) {
          continue;
        }

        processedEvents.add(eventKey);

        // Handle different resource statuses
        if (event.ResourceStatus === 'UPDATE_IN_PROGRESS') {
          // Call progress callback with IN_PROGRESS status
          if (onProgress) {
            onProgress({
              logicalId,
              status: 'IN_PROGRESS',
            });
          }
        } else if (event.ResourceStatus === 'UPDATE_COMPLETE') {
          // Mark resource as updated
          updatedResources.add(logicalId);

          // Call progress callback with COMPLETE status
          if (onProgress) {
            onProgress({
              logicalId,
              status: 'COMPLETE',
              progress: updatedResources.size,
              total: resourceLogicalIds.length,
            });
          }
        } else if (event.ResourceStatus === 'UPDATE_FAILED') {
          // Add to failed resources
          const reason = event.ResourceStatusReason || 'Unknown error';
          failedResources.push({
            logicalId,
            reason,
          });

          // Call progress callback with FAILED status
          if (onProgress) {
            onProgress({
              logicalId,
              status: 'FAILED',
              reason,
            });
          }
        }
      }

      // Check if all resources are now accounted for
      const allResourcesProcessed =
        updatedResources.size + failedResources.length >=
        resourceLogicalIds.length;

      // If all resources processed, exit loop to return result
      if (allResourcesProcessed) {
        break;
      }

      // Check stack status AFTER processing events - if rollback in progress, throw
      const stackStatus = await this.cfRepo.getStackStatus(stackIdentifier);
      if (
        stackStatus.includes('ROLLBACK') &&
        stackStatus !== 'UPDATE_ROLLBACK_COMPLETE'
      ) {
        throw new Error('Update operation failed and rolled back');
      }
    }

    // Check final stack status before returning
    const finalStackStatus = await this.cfRepo.getStackStatus(stackIdentifier);

    // Return result (success = no failures)
    const success = failedResources.length === 0;
    return {
      success,
      updatedCount: updatedResources.size,
      failedCount: failedResources.length,
      failedResources,
    };
  }

  /**
   * Delay helper for polling intervals
   *
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   * @private
   */
  async _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = { UpdateProgressMonitor };
