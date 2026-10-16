/**
 * Scheduler Infrastructure
 *
 * Provides scheduling capabilities for one-time jobs.
 * Follows hexagonal architecture with interface + adapters pattern.
 *
 * Providers:
 * - eventbridge: AWS EventBridge Scheduler (production on AWS)
 * - netlify: poll-and-dispatch from a Netlify scheduled function
 * - mock: In-memory mock scheduler (local development)
 *
 * Adapters are lazy getters (friggframework/frigg#545, 1176a004): the
 * EventBridge adapter requires @aws-sdk/client-scheduler, which is not a
 * core dependency, and core/index -> application -> scheduler-commands ->
 * this barrel runs on every require('@friggframework/core'). An eager
 * require crashed any deployment without that SDK (e.g. a pruned Netlify
 * function bundle).
 */

const { SchedulerServiceInterface } = require('./scheduler-service-interface');
const {
    createSchedulerService,
    SCHEDULER_PROVIDERS,
    determineProvider,
} = require('./scheduler-service-factory');

module.exports = {
    // Interface (Port)
    SchedulerServiceInterface,

    // Adapters (loaded on access)
    get EventBridgeSchedulerAdapter() {
        return require('./eventbridge-scheduler-adapter').EventBridgeSchedulerAdapter;
    },
    get MockSchedulerAdapter() {
        return require('./mock-scheduler-adapter').MockSchedulerAdapter;
    },
    get NetlifySchedulerAdapter() {
        return require('./netlify-scheduler-adapter').NetlifySchedulerAdapter;
    },

    // Factory
    createSchedulerService,
    SCHEDULER_PROVIDERS,
    determineProvider,
};
