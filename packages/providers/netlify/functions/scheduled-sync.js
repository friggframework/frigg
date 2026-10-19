/**
 * Netlify Scheduled Function: Cron Dispatcher
 *
 * Runs on a cron schedule (configured in netlify.toml) to:
 * 1. Process due one-time schedules (from NetlifySchedulerAdapter)
 * 2. Trigger ONGOING_SYNC for integrations that implement startOngoingSync,
 *    per their Definition.schedule.scope (core DispatchOngoingSyncs):
 *    'class' (default) sends one message per integration class with no
 *    integration id; 'installation' sends one per ENABLED integration record,
 *    with data.integrationId so the worker hydrates it, skipping records the
 *    definition's schedule.isDue(integration, { now }) declines.
 *
 * Netlify Scheduled Functions have a 60-second execution limit.
 * For longer processing, work is dispatched to the background function.
 */
const {
    loadAppDefinition,
} = require('@friggframework/core/handlers/app-definition-loader');
const {
    createSchedulerService,
} = require('@friggframework/core/infrastructure/scheduler');
const {
    createQueueProvider,
} = require('@friggframework/core/queues');
const { connectPrisma } = require('@friggframework/core/database/prisma');
const {
    createIntegrationRepository,
} = require('@friggframework/core/integrations/repositories/integration-repository-factory');
const {
    DispatchOngoingSyncs,
} = require('@friggframework/core/integrations/use-cases/dispatch-ongoing-syncs');
const { createNetlifyHandler } = require('../lib/create-netlify-handler');
const {
    ScheduledJobRepository,
} = require('../lib/scheduled-job-repository');

const WORKER_FUNCTION_PATH = '/.netlify/functions/worker-background';

const handler = createNetlifyHandler({
    eventName: 'Scheduled Sync (Netlify Cron)',
    isUserFacingResponse: false,
    method: async (event, context) => {
        const startTime = Date.now();
        console.log(
            '[ScheduledSync] Cron triggered at',
            new Date().toISOString()
        );

        // Connect to database for scheduler repository
        const prismaClient = await connectPrisma();

        const repository = new ScheduledJobRepository({ prismaClient });
        const queueProvider = createQueueProvider({ provider: 'netlify-background' });

        // 1. Process due one-time schedules
        const scheduler = createSchedulerService({
            provider: 'netlify',
            repository,
            queueProvider,
        });

        const { processed, errors } = await scheduler.processDueSchedules();
        console.log(
            `[ScheduledSync] One-time schedules: ${processed} processed, ${errors} errors`
        );

        // 2. Trigger ongoing sync, per class or per installation
        const { integrations: integrationClasses } = loadAppDefinition();
        // Built on first use: only scope 'installation' reads integration records.
        let integrationRepository;
        const dispatchOngoingSyncs = new DispatchOngoingSyncs({
            integrationRepository: {
                findIntegrations: (filter) =>
                    (integrationRepository ||= createIntegrationRepository()).findIntegrations(filter),
            },
            queueProvider,
            queueId: WORKER_FUNCTION_PATH,
        });
        const {
            dispatched: syncDispatched,
            notDue: syncsNotDue,
            errors: syncErrors,
        } = await dispatchOngoingSyncs.execute(integrationClasses);

        const duration = Date.now() - startTime;
        console.log(
            `[ScheduledSync] Completed in ${duration}ms: ${processed} schedules processed, ${syncDispatched} syncs dispatched`
        );

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Scheduled sync completed',
                timestamp: new Date().toISOString(),
                durationMs: duration,
                schedulesProcessed: processed,
                scheduleErrors: errors,
                syncsDispatched: syncDispatched,
                syncsNotDue,
                syncErrors,
            }),
        };
    },
});

module.exports = { handler };
