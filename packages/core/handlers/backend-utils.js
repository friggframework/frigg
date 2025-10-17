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
const { loadAppDefinition } = require('./app-definition-loader');

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
    return {
        processRepository: createProcessRepository(),
        integrationRepository: createIntegrationRepository(),
        moduleRepository: createModuleRepository(),
    };
};

/**
 * Load hydrated integration instance for webhook events WITH integrationId.
 * Must load app definition to find all integration classes, then match
 * against the integration record's type.
 */
const loadIntegrationForWebhook = async (integrationId) => {
    const { integrations: integrationClasses } = loadAppDefinition();
    const { integrationRepository, moduleRepository } = initializeRepositories();

    const moduleDefinitions = getModulesDefinitionFromIntegrationClasses(
        integrationClasses
    );
    const moduleFactory = new ModuleFactory({
        moduleRepository,
        moduleDefinitions,
    });

    const getIntegrationInstance = new GetIntegrationInstance({
        integrationRepository,
        integrationClasses,
        moduleFactory,
    });

    const integrationRecord = await integrationRepository.findIntegrationById(
        integrationId
    );

    if (!integrationRecord) {
        throw new Error(
            `No integration found by the ID of ${integrationId}`
        );
    }

    return await getIntegrationInstance.execute(
        integrationId,
        integrationRecord.userId
    );
};

/**
 * Load hydrated integration instance for process-based events.
 * Integration class is already known from queue worker context,
 * so we receive it as a parameter rather than loading all classes.
 */
const loadIntegrationForProcess = async (processId, integrationClass) => {
    if (!integrationClass) {
        throw new Error('integrationClass parameter is required');
    }

    if (!processId) {
        throw new Error('processId is required in queue message data');
    }

    const { processRepository, integrationRepository, moduleRepository } =
        initializeRepositories();

    const moduleDefinitions = getModulesDefinitionFromIntegrationClasses([
        integrationClass,
    ]);
    const moduleFactory = new ModuleFactory({
        moduleRepository,
        moduleDefinitions,
    });

    const getIntegrationInstance = new GetIntegrationInstance({
        integrationRepository,
        integrationClasses: [integrationClass],
        moduleFactory,
    });

    const process = await processRepository.findById(processId);

    if (!process) {
        throw new Error(`Process not found: ${processId}`);
    }

    return await getIntegrationInstance.execute(
        process.integrationId,
        process.userId
    );
};

const createQueueWorker = (integrationClass) => {
    class QueueWorker extends Worker {
        async _run(params, context) {
            try {
                let integrationInstance;
                if (
                    params.event === 'ON_WEBHOOK' &&
                    params.data?.integrationId
                ) {
                    integrationInstance = await loadIntegrationForWebhook(
                        params.data.integrationId
                    );
                } else if (params.data?.processId) {
                    integrationInstance = await loadIntegrationForProcess(
                        params.data.processId,
                        integrationClass
                    );
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
