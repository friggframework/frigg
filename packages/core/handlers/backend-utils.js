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
        integrationRecord =
            await integrationRepository.findIntegrationById(integrationId);
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
    class QueueWorker extends Worker {
        async _run(params, context) {
            try {
                let integrationInstance;

                // Prioritize processId first (for sync handler compatibility),
                // then integrationId (for ANY event type that needs hydration),
                // fallback to unhydrated instance
                if (params.data?.processId) {
                    integrationInstance = await loadIntegrationForProcess(
                        params.data.processId,
                        integrationClass
                    );
                    if (integrationInstance?.status === 'DISABLED') {
                        console.warn(
                            `[${integrationClass.Definition.name}] Integration for process ${params.data.processId} is DISABLED. Discarding ${params.event} message.`
                        );
                        return;
                    }
                } else if (params.data?.integrationId) {
                    integrationInstance = await loadIntegrationForWebhook(
                        params.data.integrationId
                    );
                    if (!integrationInstance) {
                        console.warn(
                            `[${integrationClass.Definition.name}] Integration ${params.data.integrationId} no longer exists. Discarding ${params.event} message.`
                        );
                        return;
                    }
                    if (integrationInstance.status === 'DISABLED') {
                        console.warn(
                            `[${integrationClass.Definition.name}] Integration ${params.data.integrationId} is DISABLED. Discarding ${params.event} message.`
                        );
                        return;
                    }
                } else {
                    // Instantiates a DRY integration class without database records.
                    // There will be cases where we need to use helpers that the api modules can export.
                    // Like for HubSpot, the answer is to do a reverse lookup for the integration by the entity external ID (HubSpot Portal ID),
                    // and then you'll have the integration ID available to hydrate from.
                    integrationInstance = new integrationClass();
                }

                const dispatcher = new IntegrationEventDispatcher(
                    integrationInstance
                );

                return await dispatcher.dispatchJob({
                    event: params.event,
                    data: params.data,
                    context: context,
                });
            } catch (error) {
                console.error(
                    `Error in ${params.event} for ${integrationClass.Definition.name}:`,
                    error
                );

                // 4xx HTTP errors are permanent — the requester already
                // attempted token refresh (401) and backoff (429/5xx).
                // By the time a 4xx reaches here, retrying won't help.
                // 408 (timeout) and 429 (rate limit) are excluded — both are transient.
                const status = error.statusCode;
                if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
                    error.isHaltError = true;
                    console.warn(
                        `[${integrationClass.Definition.name}] Permanent ${status} error for ${params.event} — message will be discarded (no retry)`
                    );
                }

                throw error;
            }
        }
    }
    return QueueWorker;
};

module.exports = {
    loadRouterFromObject,
    createQueueWorker,
};
