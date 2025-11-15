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
    console.log(`[loadIntegrationForWebhook] Loading integration ${integrationId}`);

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

    const integrationRecord = await integrationRepository.findIntegrationById(
        integrationId
    );

    console.log(`[loadIntegrationForWebhook] Found integration record - userId: ${integrationRecord?.userId}, status: ${integrationRecord?.status}`);

    const instance = await getIntegrationInstance.execute(
        integrationId,
        integrationRecord.userId
    );

    console.log(`[loadIntegrationForWebhook] Instance created - has entities: ${!!instance.entities}, has config: ${!!instance.config}`);

    return instance;
};

const loadIntegrationForProcess = async (processId, integrationClass) => {
    console.log(`[loadIntegrationForProcess] Loading integration for processId: ${processId}`);

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

    console.log(`[loadIntegrationForProcess] Found process - integrationId: ${process.integrationId}, userId: ${process.userId}`);

    const instance = await getIntegrationInstance.execute(
        process.integrationId,
        process.userId
    );

    console.log(`[loadIntegrationForProcess] Instance created - has entities: ${!!instance.entities}, has config: ${!!instance.config}`);
    console.log(`[loadIntegrationForProcess] Entity keys: ${Object.keys(instance.entities || {}).join(', ')}`);

    return instance;
};

const createQueueWorker = (integrationClass) => {
    class QueueWorker extends Worker {
        async _run(params, context) {
            try {
                console.log(`[QueueWorker] Event: ${params.event}, Data keys: ${Object.keys(params.data || {}).join(', ')}`);
                console.log(`[QueueWorker] processId: ${params.data?.processId}, integrationId: ${params.data?.integrationId}`);

                let integrationInstance;

                // Prioritize processId first (for sync handler compatibility),
                // then integrationId (for ANY event type that needs hydration),
                // fallback to unhydrated instance
                if (params.data?.processId) {
                    console.log(`[QueueWorker] Hydrating via processId: ${params.data.processId}`);
                    integrationInstance = await loadIntegrationForProcess(
                        params.data.processId,
                        integrationClass
                    );
                } else if (params.data?.integrationId) {
                    console.log(`[QueueWorker] Hydrating via integrationId: ${params.data.integrationId}`);
                    integrationInstance = await loadIntegrationForWebhook(
                        params.data.integrationId
                    );
                    console.log(`[QueueWorker] Hydration complete - userId: ${integrationInstance.userId}, config keys: ${Object.keys(integrationInstance.config || {}).join(', ')}`);
                } else {
                    console.log(`[QueueWorker] No processId or integrationId - creating unhydrated instance`);
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
