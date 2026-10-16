/**
 * Netlify Scheduled Function: Cron Dispatcher
 *
 * Runs on a cron schedule (configured in netlify.toml) to:
 * 1. Process due one-time schedules (from NetlifySchedulerAdapter)
 * 2. Trigger ongoing sync jobs for active integrations
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

        // 2. Trigger ongoing sync for active integrations
        const { integrations: integrationClasses } = loadAppDefinition();
        let syncDispatched = 0;

        for (const IntegrationClass of integrationClasses) {
            const name = IntegrationClass.Definition?.name;
            if (!name) continue;

            // Check if this integration defines an ONGOING_SYNC handler
            if (typeof IntegrationClass.prototype.startOngoingSync !== 'function') continue;

            try {
                await queueProvider.send(
                    {
                        integrationName: name,
                        event: 'ONGOING_SYNC',
                        data: {},
                    },
                    WORKER_FUNCTION_PATH
                );
                syncDispatched++;
            } catch (error) {
                console.error(
                    `[ScheduledSync] Failed to dispatch sync for ${name}:`,
                    error.message
                );
            }
        }

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
            }),
        };
    },
});

module.exports = { handler };
