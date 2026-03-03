/**
 * Scheduler Infrastructure
 *
 * Provides scheduling capabilities for one-time jobs.
 * Follows hexagonal architecture with interface + adapters pattern.
 *
 * Providers:
 * - eventbridge: AWS EventBridge Scheduler (production on AWS)
 * - netlify: Netlify poll-and-dispatch scheduler (production on Netlify)
 * - mock: In-memory mock scheduler (local development)
 *
 * IMPORTANT: Adapter classes are lazily loaded via getters so that
 * requiring this barrel does NOT pull in heavy SDK deps
 * (e.g. @aws-sdk/client-scheduler) unless the adapter is actually used.
 */

const { SchedulerServiceInterface } = require('./scheduler-service-interface');
const {
    createSchedulerService,
    SCHEDULER_PROVIDERS,
    determineProvider,
} = require('./scheduler-service-factory');

// Lazy-loaded adapter classes — only resolved on first property access
module.exports = {
    // Interface (Port)
    SchedulerServiceInterface,

    // Adapters — lazy to avoid eager require of @aws-sdk/client-scheduler
    get EventBridgeSchedulerAdapter() {
        return require('@friggframework/provider-aws').EventBridgeSchedulerAdapter;
    },
    get MockSchedulerAdapter() {
        return require('./mock-scheduler-adapter').MockSchedulerAdapter;
    },
    get NetlifySchedulerAdapter() {
        return require('./netlify-scheduler-adapter').NetlifySchedulerAdapter;
    },

    // Factory (also lazy-loads adapters internally)
    createSchedulerService,
    SCHEDULER_PROVIDERS,
    determineProvider,
};
