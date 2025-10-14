const { Router } = require('express');
const { Worker } = require('@friggframework/core');
const {
    IntegrationEventDispatcher,
} = require('./integration-event-dispatcher');
const { GetIntegrationInstance } = require('../integrations/use-cases/get-integration-instance');
const { ModuleFactory } = require('../modules/module-factory');
const { createProcessRepository } = require('../integrations/repositories/process-repository-factory');
const { createIntegrationRepository } = require('../integrations/repositories/integration-repository-factory');
const { createModuleRepository } = require('../modules/repositories/module-repository-factory');
const { getModulesDefinitionFromIntegrationClasses } = require('../integrations/utils/map-integration-dto');

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

const createQueueWorker = (integrationClass) => {
    class QueueWorker extends Worker {
        async _run(params, context) {
            try {
                // Create repositories
                const processRepository = createProcessRepository();
                const integrationRepository = createIntegrationRepository();
                const moduleRepository = createModuleRepository();

                // Extract module definitions from integration class (as array)
                const moduleDefinitions = getModulesDefinitionFromIntegrationClasses([integrationClass]);

                // Create module factory
                const moduleFactory = new ModuleFactory({
                    moduleRepository,
                    moduleDefinitions,
                });

                // Create GetIntegrationInstance use case
                const getIntegrationInstance = new GetIntegrationInstance({
                    integrationRepository,
                    integrationClasses: [integrationClass],
                    moduleFactory,
                });

                // Get processId from queue message data
                const processId = params.data?.processId;

                if (!processId) {
                    throw new Error('processId is required in queue message data');
                }

                // Look up process to get integrationId and userId
                const process = await processRepository.findById(processId);

                if (!process) {
                    throw new Error(`Process not found: ${processId}`);
                }

                // Load integration instance with modules
                const integrationInstance = await getIntegrationInstance.execute(
                    process.integrationId,
                    process.userId
                );

                // Dispatch event to integration handler
                const dispatcher = new IntegrationEventDispatcher(
                    integrationInstance
                );
                const res = await dispatcher.dispatchJob({
                    event: params.event,
                    data: params.data,
                    context: context,
                });
                return res;
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
