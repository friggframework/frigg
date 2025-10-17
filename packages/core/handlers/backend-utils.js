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

    const integrationRecord = await integrationRepository.findIntegrationById(
        integrationId
    );

    return await getIntegrationInstance.execute(
        integrationId,
        integrationRecord.userId
    );
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

    return await getIntegrationInstance.execute(
        process.integrationId,
        process.userId
    );
};

const createQueueWorker = (integrationClass) => {
    class QueueWorker extends Worker {
        async _run(params, context) {
            try {
                if (params.event === 'ON_WEBHOOK') {
                    if (!params.data?.integrationId) {
                        throw new Error(
                            'integrationId is required in data for ON_WEBHOOK event'
                        );
                    }

                    integrationInstance = await loadIntegrationForWebhook(
                        params.data.integrationId
                    );
                } else if (params.data?.processId) {
                    integrationInstance = await loadIntegrationForProcess(
                        params.data.processId,
                        integrationClass
                    );
                } else {
                    // Instantiates a DRY integration class without database records
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
