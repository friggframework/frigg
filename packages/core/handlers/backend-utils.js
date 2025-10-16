const { Router } = require('express');
const { Worker } = require('@friggframework/core');
const {
    IntegrationEventDispatcher,
} = require('./integration-event-dispatcher');

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
                let integrationInstance;

                // Check if this is a webhook with integrationId
                if (params.event === 'ON_WEBHOOK' && params.data?.integrationId) {
                    // Load hydrated integration instance
                    const { GetIntegrationInstance } = require('../integrations/use-cases/get-integration-instance');
                    const { createIntegrationRepository } = require('../integrations/repositories/integration-repository-factory');
                    const { ModuleFactory } = require('../modules/module-factory');
                    const { createModuleRepository } = require('../modules/repositories/module-repository-factory');
                    const { loadAppDefinition } = require('./app-definition-loader');
                    const { getModulesDefinitionFromIntegrationClasses } = require('../integrations/utils/map-integration-dto');

                    const { integrations: integrationClasses } = loadAppDefinition();
                    const integrationRepository = createIntegrationRepository();
                    const moduleRepository = createModuleRepository();
                    const moduleFactory = new ModuleFactory({
                        moduleRepository,
                        moduleDefinitions: getModulesDefinitionFromIntegrationClasses(integrationClasses),
                    });

                    const getIntegrationInstance = new GetIntegrationInstance({
                        integrationRepository,
                        integrationClasses,
                        moduleFactory,
                    });

                    const integrationRecord = await integrationRepository.findIntegrationById(params.data.integrationId);
                    integrationInstance = await getIntegrationInstance.execute(
                        params.data.integrationId,
                        integrationRecord.userId
                    );
                } else {
                    // Standard flow - unhydrated instance
                    integrationInstance = new integrationClass();
                }

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
