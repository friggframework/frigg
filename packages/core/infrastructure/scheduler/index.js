/**
 * Scheduler Infrastructure
 *
 * Provides scheduling capabilities for one-time jobs.
 * Follows hexagonal architecture with interface + adapters pattern.
 *
 * Providers:
 * - eventbridge: AWS EventBridge Scheduler (production)
 * - mock: In-memory mock scheduler (local development)
 */

const { SchedulerServiceInterface } = require('./scheduler-service-interface');
const { EventBridgeSchedulerAdapter, SCHEDULE_GROUP_NAME } = require('./eventbridge-scheduler-adapter');
const { MockSchedulerAdapter } = require('./mock-scheduler-adapter');
const {
    createSchedulerService,
    SCHEDULER_PROVIDERS,
    determineProvider,
} = require('./scheduler-service-factory');

module.exports = {
    // Interface (Port)
    SchedulerServiceInterface,

    // Adapters
    EventBridgeSchedulerAdapter,
    MockSchedulerAdapter,
    SCHEDULE_GROUP_NAME,

    // Factory
    createSchedulerService,
    SCHEDULER_PROVIDERS,
    determineProvider,
};
