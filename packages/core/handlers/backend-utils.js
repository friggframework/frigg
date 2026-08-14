const { Router } = require('express');
const { Worker } = require('@friggframework/core');
const {
    IntegrationEventDispatcher,
} = require('./integration-event-dispatcher');
const {
    GetIntegrationInstance,
} = require('../integrations/use-cases/get-integration-instance');
const { ModuleFactory } = require('../modules/module-factory');
const {
    createProcessRepository,
} = require('../integrations/repositories/process-repository-factory');
const {
    createIntegrationRepository,
} = require('../integrations/repositories/integration-repository-factory');
const {
    createModuleRepository,
} = require('../modules/repositories/module-repository-factory');
const {
    getModulesDefinitionFromIntegrationClasses,
} = require('../integrations/utils/map-integration-dto');

const loadRouterFromObject = (IntegrationClass, routerObject) => {
    const router = Router();
    const { path, method, event } = routerObject;

    console.log(
        `Registering ${method} ${path} for ${IntegrationClass.Definition.name}`
    );

    router[method.toLowerCase()](path, async (req, res, next) => {
        try {
            const integrationInstance = new IntegrationClass();
            // initialize() registers dynamic user actions AND merges any Tier 3
            // Integration Extension events into instance.events before dispatch.
            await integrationInstance.initialize();
            const dispatcher = new IntegrationEventDispatcher(
                integrationInstance
            );
            const result = await dispatcher.dispatchHttp({
                event,
                req,
                res,
                next,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    });

    return router;
};

const initializeRepositories = () => {
    const processRepository = createProcessRepository();
    const integrationRepository = createIntegrationRepository();
    const moduleRepository = createModuleRepository();

    return { processRepository, integrationRepository, moduleRepository };
};

const createModuleFactoryWithDefinitions = (
    moduleRepository,
    integrationClasses
) => {
    const moduleDefinitions =
        getModulesDefinitionFromIntegrationClasses(integrationClasses);

    return new ModuleFactory({
        moduleRepository,
        moduleDefinitions,
    });
};

const loadIntegrationForWebhook = async (integrationId) => {
    const { loadAppDefinition } = require('./app-definition-loader');
    const { integrations: integrationClasses } = loadAppDefinition();

    const { integrationRepository, moduleRepository } =
        initializeRepositories();

    const moduleFactory = createModuleFactoryWithDefinitions(
        moduleRepository,
        integrationClasses
    );

    const getIntegrationInstance = new GetIntegrationInstance({
        integrationRepository,
        integrationClasses,
        moduleFactory,
    });

    let integrationRecord;
    try {
        integrationRecord = await integrationRepository.findIntegrationById(
            integrationId
        );
    } catch (error) {
        if (error.message?.includes('not found')) {
            return null;
        }
        throw error;
    }

    const instance = await getIntegrationInstance.execute(
        integrationId,
        integrationRecord.userId
    );

    return instance;
};

// Returns false only when the integration is confirmed gone; a transient
// lookup failure returns true so genuine errors keep their normal retry path.
const integrationExists = async (integrationId) => {
    const integrationRepository = createIntegrationRepository();
    try {
        const record = await integrationRepository.findIntegrationById(
            integrationId
        );
        return Boolean(record);
    } catch (error) {
        if (error.message?.includes('not found')) {
            return false;
        }
        return true;
    }
};

const loadIntegrationForProcess = async (processId, integrationClass) => {
    const { processRepository, integrationRepository, moduleRepository } =
        initializeRepositories();

    const moduleFactory = createModuleFactoryWithDefinitions(moduleRepository, [
        integrationClass,
    ]);

    const getIntegrationInstance = new GetIntegrationInstance({
        integrationRepository,
        integrationClasses: [integrationClass],
        moduleFactory,
    });

    if (!processId) {
        throw new Error('processId is required in queue message data');
    }

    const process = await processRepository.findById(processId);

    if (!process) {
        throw new Error(`Process not found: ${processId}`);
    }

    const instance = await getIntegrationInstance.execute(
        process.integrationId,
        process.userId
    );

    return instance;
};

const createQueueWorker = (integrationClass) => {
    const integrationName = integrationClass.Definition.name;

    class QueueWorker extends Worker {
        async _run(params, context) {
            const logCtx = {
                integration: integrationName,
                event: params.event,
                processId: params.data?.processId,
                integrationId: params.data?.integrationId,
            };

            try {
                let integrationInstance;

                // Prioritize processId first (for sync handler compatibility),
                // then integrationId (for ANY event type that needs hydration),
                // fallback to unhydrated instance
                if (params.data?.processId) {
                    console.log(`[QueueWorker] hydrating by processId`, logCtx);
                    integrationInstance = await loadIntegrationForProcess(
                        params.data.processId,
                        integrationClass
                    );
                    console.log(`[QueueWorker] hydrated`, {
                        ...logCtx,
                        integrationStatus: integrationInstance?.status,
                        hydratedIntegrationId: integrationInstance?.id,
                    });
                    if (
                        !checkIntegrationRunnable(
                            integrationInstance?.status,
                            `[${integrationName}] Integration for process ${params.data.processId} (${params.event})`
                        )
                    ) {
                        return;
                    }
                } else if (params.data?.integrationId) {
                    console.log(
                        `[QueueWorker] hydrating by integrationId`,
                        logCtx
                    );
                    integrationInstance = await loadIntegrationForWebhook(
                        params.data.integrationId
                    );
                    if (!integrationInstance) {
                        console.warn(
                            `[${integrationName}] Integration ${params.data.integrationId} no longer exists. Discarding ${params.event} message.`
                        );
                        return;
                    }
                    console.log(`[QueueWorker] hydrated`, {
                        ...logCtx,
                        integrationStatus: integrationInstance?.status,
                    });
                    if (
                        !checkIntegrationRunnable(
                            integrationInstance.status,
                            `[${integrationName}] Integration ${params.data.integrationId} (${params.event})`
                        )
                    ) {
                        return;
                    }
                } else {
                    // Instantiates a DRY integration class without database records.
                    // There will be cases where we need to use helpers that the api modules can export.
                    // Like for HubSpot, the answer is to do a reverse lookup for the integration by the entity external ID (HubSpot Portal ID),
                    // and then you'll have the integration ID available to hydrate from.
                    console.log(
                        `[QueueWorker] no processId/integrationId — running dry instance`,
                        logCtx
                    );
                    integrationInstance = new integrationClass();
                    // Merge Tier 3 Integration Extension events into instance.events
                    // so extension-contributed queue events can be dispatched.
                    await integrationInstance.initialize();
                }

                const dispatcher = new IntegrationEventDispatcher(
                    integrationInstance
                );

                console.log(
                    `[QueueWorker] dispatching ${params.event}`,
                    logCtx
                );
                const result = await dispatcher.dispatchJob({
                    event: params.event,
                    data: params.data,
                    context: context,
                });
                console.log(
                    `[QueueWorker] ${params.event} dispatched ok`,
                    logCtx
                );
                return result;
            } catch (error) {
                // Integration deleted mid-flight: no retry can succeed once
                // it's gone, so discard instead of sending it to the DLQ.
                if (
                    params.data?.integrationId &&
                    !(await integrationExists(params.data.integrationId))
                ) {
                    console.warn(
                        `[${integrationName}] Integration ${params.data.integrationId} was deleted mid-flight — discarding ${params.event} message (no retry)`
                    );
                    return;
                }

                console.error(
                    `Error in ${params.event} for ${integrationName}:`,
                    error
                );

                // 4xx HTTP errors are permanent — the requester already
                // attempted token refresh (401) and backoff (429/5xx).
                // By the time a 4xx reaches here, retrying won't help.
                // 408 (timeout) and 429 (rate limit) are excluded — both are transient.
                const status = error.statusCode;
                if (
                    status &&
                    status >= 400 &&
                    status < 500 &&
                    status !== 408 &&
                    status !== 429
                ) {
                    error.isHaltError = true;
                    console.warn(
                        `[${integrationName}] Permanent ${status} error for ${params.event} — message will be discarded (no retry)`,
                        {
                            ...logCtx,
                            errorName: error.name,
                            errorMessage: error.message,
                        }
                    );
                }

                throw error;
            }
        }
    }
    return QueueWorker;
};

/**
 * Decides what the queue worker does with a message for an integration that
 * is not runnable (ADR-031, the silent-ack companion).
 *
 * DISABLED and IN_DELETION are intentional stops — an operator action, or a
 * deletion in flight — so their work is supposed to be dropped: return false
 * and the caller acks. ERROR is different: silently acking it is what turned
 * one lost auth race into months of silent data loss (SQS deleted every
 * message with no DLQ entry), so ERROR throws and SQS retries, then DLQs.
 * FRIGG_LEGACY_ERROR_ACK=true restores the old silent ack as a kill switch,
 * with no redeploy.
 *
 * @param {string|undefined} status - The integration's status.
 * @param {string} contextLabel - Log prefix identifying the integration.
 * @returns {boolean} True when the message should be processed, false when
 *   it should be discarded (acked) on purpose.
 */
function checkIntegrationRunnable(status, contextLabel) {
    if (!['DISABLED', 'ERROR', 'IN_DELETION'].includes(status)) {
        return true;
    }
    if (status === 'ERROR' && process.env.FRIGG_LEGACY_ERROR_ACK !== 'true') {
        throw new Error(
            `${contextLabel} is in ERROR state; rejecting the message so ` +
                'SQS retries it instead of silently dropping the work'
        );
    }
    console.warn(`${contextLabel} is ${status}. Discarding message.`);
    return false;
}

module.exports = {
    loadRouterFromObject,
    createQueueWorker,
    integrationExists,
    loadIntegrationForWebhook,
    checkIntegrationRunnable,
};
