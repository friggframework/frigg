/**
 * Scheduler Infrastructure
 *
 * Provides scheduling capabilities for one-time and recurring jobs.
 * Uses AWS EventBridge Scheduler as the primary implementation.
 */

const { EventBridgeSchedulerAdapter, SCHEDULE_GROUP_NAME } = require('./eventbridge-scheduler-adapter');
const { createSchedulerAdapter, SCHEDULER_PROVIDERS } = require('./scheduler-factory');

module.exports = {
    EventBridgeSchedulerAdapter,
    SCHEDULE_GROUP_NAME,
    createSchedulerAdapter,
    SCHEDULER_PROVIDERS,
};
