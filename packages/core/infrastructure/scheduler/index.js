/**
 * Scheduler Infrastructure
 *
 * Provides scheduling capabilities for one-time jobs.
 * Follows hexagonal architecture with interface + adapters pattern.
 *
 * Use createSchedulerService() to get the correct adapter for the
 * active provider. The factory uses resolveProvider() internally.
 *
 * Adapters:
 * - AWS EventBridge: via @friggframework/provider-aws (SchedulerAdapter)
 * - Netlify: NetlifySchedulerAdapter (ships with core, no AWS deps)
 * - Mock: MockSchedulerAdapter (local development)
 */

const { SchedulerServiceInterface } = require('./scheduler-service-interface');
const {
    createSchedulerService,
    SCHEDULER_PROVIDERS,
} = require('./scheduler-service-factory');

module.exports = {
    // Interface (Port)
    SchedulerServiceInterface,

    // Core adapters (no external SDK dependencies)
    get MockSchedulerAdapter() {
        return require('./mock-scheduler-adapter').MockSchedulerAdapter;
    },
    get NetlifySchedulerAdapter() {
        return require('./netlify-scheduler-adapter').NetlifySchedulerAdapter;
    },

    // Factory — resolves the correct adapter via provider plugin system
    createSchedulerService,
    SCHEDULER_PROVIDERS,
};
