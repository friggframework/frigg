/**
 * Scheduler Infrastructure
 *
 * Provides scheduling capabilities for one-time and recurring jobs.
 * Uses AWS EventBridge Scheduler for production and Mock Scheduler for local development.
 *
 * Providers:
 * - eventbridge: AWS EventBridge Scheduler (production)
 * - mock: In-memory mock scheduler (local development)
 */

const { EventBridgeSchedulerAdapter, SCHEDULE_GROUP_NAME } = require('./eventbridge-scheduler-adapter');
const { MockSchedulerAdapter } = require('./mock-scheduler-adapter');
const { createSchedulerAdapter, SCHEDULER_PROVIDERS, determineProvider } = require('./scheduler-factory');

module.exports = {
    EventBridgeSchedulerAdapter,
    MockSchedulerAdapter,
    SCHEDULE_GROUP_NAME,
    createSchedulerAdapter,
    SCHEDULER_PROVIDERS,
    determineProvider,
};
