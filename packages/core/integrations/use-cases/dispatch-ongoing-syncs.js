const {
    SCHEDULE_SCOPES,
    resolveScheduleConfig,
} = require('../schedule-config');

const ONGOING_SYNC_EVENT = 'ONGOING_SYNC';
const ACTIVE_STATUS = 'ENABLED';

/**
 * Dispatches one cron tick of ONGOING_SYNC to the queue worker, per each
 * integration class's `Definition.schedule.scope` (schedule-config.js):
 *
 * - 'class' (default): one message per class, `data: {}`.
 * - 'installation': one message per ENABLED integration record of the class,
 *   `data: { integrationId }`, so the worker hydrates that installation;
 *   skipped when the definition's `isDue(integration, { now })` says no.
 *
 * Only classes that implement `startOngoingSync` take part. A failure for one
 * class or installation is counted and logged; the rest still go out.
 */
class DispatchOngoingSyncs {
    /**
     * @param {Object} params
     * @param {Object} params.integrationRepository - findIntegrations({ type, status })
     * @param {Object} params.queueProvider - send(message, queueId)
     * @param {string} params.queueId - the worker the messages go to
     * @param {() => Date} [params.now]
     * @param {Object} [params.logger=console]
     */
    constructor({ integrationRepository, queueProvider, queueId, now = () => new Date(), logger = console }) {
        this.integrationRepository = integrationRepository;
        this.queueProvider = queueProvider;
        this.queueId = queueId;
        this.now = now;
        this.logger = logger;
    }

    /**
     * @param {Array<Function>} integrationClasses
     * @returns {Promise<{ dispatched: number, notDue: number, errors: number }>}
     */
    async execute(integrationClasses = []) {
        const result = { dispatched: 0, notDue: 0, errors: 0 };
        const now = this.now();

        for (const IntegrationClass of integrationClasses) {
            const name = IntegrationClass?.Definition?.name;
            if (!name) continue;
            if (typeof IntegrationClass.prototype?.startOngoingSync !== 'function') continue;

            try {
                const { scope, isDue } = resolveScheduleConfig(IntegrationClass.Definition);
                if (scope === SCHEDULE_SCOPES.INSTALLATION) {
                    await this._dispatchPerInstallation(name, isDue, now, result);
                } else {
                    await this._send(name, {});
                    result.dispatched++;
                }
            } catch (error) {
                result.errors++;
                this.logger.error(`[ScheduledSync] Failed to dispatch sync for ${name}:`, error.message);
            }
        }

        return result;
    }

    async _dispatchPerInstallation(name, isDue, now, result) {
        const integrations = await this.integrationRepository.findIntegrations({
            type: name,
            status: ACTIVE_STATUS,
        });

        for (const integration of integrations || []) {
            try {
                if (isDue && (await isDue(integration, { now })) !== true) {
                    result.notDue++;
                    continue;
                }
                await this._send(name, { integrationId: integration.id });
                result.dispatched++;
            } catch (error) {
                result.errors++;
                this.logger.error(
                    `[ScheduledSync] Failed to dispatch sync for ${name} integration ${integration?.id}:`,
                    error.message
                );
            }
        }
    }

    _send(integrationName, data) {
        return this.queueProvider.send(
            { integrationName, event: ONGOING_SYNC_EVENT, data },
            this.queueId
        );
    }
}

module.exports = { DispatchOngoingSyncs, ONGOING_SYNC_EVENT };
