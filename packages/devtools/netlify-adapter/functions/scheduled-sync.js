/**
 * Netlify Scheduled Function: Cron Dispatcher
 *
 * Runs on a cron schedule to:
 * 1. Process due one-time schedules (from NetlifySchedulerAdapter)
 * 2. Trigger ongoing sync jobs for active integrations
 *
 * Configure the cron interval in netlify.toml or use the @netlify/functions
 * schedule helper:
 *
 *   import { schedule } from '@netlify/functions';
 *   export const handler = schedule('*/5 * * * *', cronHandler);
 *
 * Note: Netlify Scheduled Functions have a 60-second execution limit.
 * For longer processing, dispatch work to the background function.
 */
const { createNetlifyHandler } = require('../lib/create-netlify-handler');

const handler = createNetlifyHandler({
    eventName: 'Scheduled Sync (Netlify Cron)',
    isUserFacingResponse: false,
    method: async (event, context) => {
        console.log('[ScheduledSync] Cron triggered at', new Date().toISOString());

        // TODO: Wire up when NetlifySchedulerAdapter repository is implemented
        //
        // 1. Process due one-time schedules:
        //    const scheduler = createSchedulerService({ provider: 'netlify', repository });
        //    const { processed, errors } = await scheduler.processDueSchedules();
        //
        // 2. Trigger ongoing sync for active integrations:
        //    const queueProvider = createQueueProvider();
        //    for (const integration of activeIntegrations) {
        //        await queueProvider.send(
        //            { integrationName: integration.name, event: 'ONGOING_SYNC', data: {} },
        //            '/.netlify/functions/worker-background'
        //        );
        //    }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Scheduled sync completed',
                timestamp: new Date().toISOString(),
            }),
        };
    },
});

module.exports = { handler };
