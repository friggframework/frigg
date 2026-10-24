/**
 * Scheduler Service Factory
 *
 * Creates scheduler service instances based on configuration.
 * Returns implementations of SchedulerServiceInterface.
 *
 * Environment Detection:
 * - SCHEDULER_PROVIDER=eventbridge -> Use AWS EventBridge Scheduler
 * - SCHEDULER_PROVIDER=mock -> Use in-memory mock scheduler
 * - SCHEDULER_PROVIDER=netlify -> Netlify poll-and-dispatch scheduler
 *   (friggframework/frigg#545; needs `repository`, usually `queueProvider`)
 * - Default on Netlify (NETLIFY=true, set by the Netlify runtime and build;
 *   provider-netlify's generated functions also set SCHEDULER_PROVIDER) -> Netlify
 * - Default in dev/test/local stages -> Mock scheduler
 * - Default in other stages -> EventBridge scheduler
 * - Any other name -> require('@friggframework/provider-<name>').SchedulerAdapter
 *
 * Adapters are required inside their branch so building one never loads
 * another's SDK (@aws-sdk/client-scheduler is not a core dependency).
 */

const SCHEDULER_PROVIDERS = {
    EVENTBRIDGE: 'eventbridge',
    MOCK: 'mock',
    NETLIFY: 'netlify',
};

const LOCAL_STAGES = ['dev', 'test', 'local'];

/**
 * Determine the scheduler provider based on environment
 *
 * @returns {string} Provider name
 */
function determineProvider() {
    const explicitProvider = process.env.SCHEDULER_PROVIDER;
    if (explicitProvider) {
        return explicitProvider;
    }

    // Checked before the stage: a Netlify site with no STAGE (or STAGE=dev)
    // must still persist schedules where scheduled-sync reads them.
    if (process.env.NETLIFY === 'true') {
        return SCHEDULER_PROVIDERS.NETLIFY;
    }

    const stage = process.env.STAGE || 'dev';
    if (LOCAL_STAGES.includes(stage)) {
        return SCHEDULER_PROVIDERS.MOCK;
    }

    return SCHEDULER_PROVIDERS.EVENTBRIDGE;
}

function createDefaultScheduledJobRepository() {
    const { ScheduledJobRepository } = require('./scheduled-job-repository');
    // The prisma export is a lazy proxy: nothing connects until a query runs.
    const { prisma } = require('../../database/prisma');
    return new ScheduledJobRepository({ prismaClient: prisma });
}

/**
 * Create a scheduler service instance
 *
 * @param {Object} options
 * @param {string} options.provider - Scheduler provider ('eventbridge' or 'mock')
 * @param {string} options.region - AWS region (for EventBridge)
 * @param {boolean} options.verbose - Verbose logging (for Mock)
 * @param {Object} [options.repository] - Schedule repository (for Netlify: persists schedules)
 * @param {Object} [options.queueProvider] - Queue provider (for Netlify: dispatches due jobs)
 * @returns {SchedulerServiceInterface} Implementation of scheduler interface
 */
function createSchedulerService(options = {}) {
    const provider = options.provider || determineProvider();

    switch (provider) {
        case SCHEDULER_PROVIDERS.EVENTBRIDGE: {
            const { EventBridgeSchedulerAdapter } = require('./eventbridge-scheduler-adapter');
            return new EventBridgeSchedulerAdapter({
                region: options.region,
            });
        }
        case SCHEDULER_PROVIDERS.MOCK: {
            const { MockSchedulerAdapter } = require('./mock-scheduler-adapter');
            return new MockSchedulerAdapter({
                verbose: options.verbose,
            });
        }
        case SCHEDULER_PROVIDERS.NETLIFY: {
            const { NetlifySchedulerAdapter } = require('./netlify-scheduler-adapter');
            return new NetlifySchedulerAdapter({
                // Default: the Prisma ScheduledJob rows that the Netlify
                // scheduled-sync function polls. Without it the adapter
                // falls back to memory, and a schedule made in one function
                // is never seen by the cron.
                repository: options.repository || createDefaultScheduledJobRepository(),
                queueProvider: options.queueProvider,
            });
        }
        default: {
            let plugin;
            try {
                plugin = require('../../providers/resolve-provider').resolveProvider(null, {
                    provider,
                });
            } catch (error) {
                throw new Error(`Unknown scheduler provider: ${provider} (${error.message})`);
            }
            if (!plugin.SchedulerAdapter) {
                throw new Error(`Unknown scheduler provider: ${provider}`);
            }
            return new plugin.SchedulerAdapter(options);
        }
    }
}

module.exports = {
    createSchedulerService,
    SCHEDULER_PROVIDERS,
    determineProvider,
};
