/**
 * Scheduler Infrastructure
 *
 * Provides scheduling capabilities for one-time and recurring jobs. Recurrence is host-neutral (recurrence.js);
 * each adapter translates it.
 * Follows hexagonal architecture with interface + adapters pattern.
 *
 * Providers:
 * - eventbridge: AWS EventBridge Scheduler (production)
 * - mock: In-memory mock scheduler (local development)
 */

const { SchedulerServiceInterface, TICK, fillTick } = require('./scheduler-service-interface');
const recurrence = require('./recurrence');
const { EventBridgeSchedulerAdapter } = require('./eventbridge-scheduler-adapter');
const { MockSchedulerAdapter } = require('./mock-scheduler-adapter');
const {
    createSchedulerService,
    SCHEDULER_PROVIDERS,
    determineProvider,
} = require('./scheduler-service-factory');

module.exports = {
    // Interface (Port)
    SchedulerServiceInterface,
    TICK,
    fillTick,
    ...recurrence,

    // Adapters
    EventBridgeSchedulerAdapter,
    MockSchedulerAdapter,

    // Factory
    createSchedulerService,
    SCHEDULER_PROVIDERS,
    determineProvider,
};
