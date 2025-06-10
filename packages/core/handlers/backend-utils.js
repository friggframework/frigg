const { Router } = require('express');
const { Worker } = require('@friggframework/core');
const { loadAppDefinition } = require('./app-definition-loader');
const { IntegrationRepository } = require('../integrations/integration-repository');
const { ModuleService } = require('../module-plugin/module-service');
const { GetIntegrationInstance } = require('../integrations/use-cases/get-integration-instance');

const loadRouterFromObject = (IntegrationClass, routerObject) => {
    const router = Router();
    const { path, method, event } = routerObject;
    console.log(
        `Registering ${method} ${path} for ${IntegrationClass.Definition.name}`
    );
    router[method.toLowerCase()](path, async (req, res, next) => {
        try {
            const integration = new IntegrationClass();
            await integration.loadModules();
            await integration.registerEventHandlers();
            const result = await integration.send(event, { req, res, next });
            res.json(result);
        } catch (error) {
            next(error);
        }
    });

    return router;
};

//todo: this should be in a use case class
const createQueueWorker = (integrationClass) => {
    class QueueWorker extends Worker {
        async _run(params, context) {
            try {
                let integrationInstance;
                if (!params.integrationId) {
                    integrationInstance = new integrationClass();
                    await integrationInstance.loadModules();
                    await integrationInstance.registerEventHandlers();
                    console.log(
                        `${params.event} for ${integrationClass.Definition.name} integration with no integrationId`
                    );
                } else {
                    const { integrations: integrationClasses } = loadAppDefinition();
                    const integrationRepository = new IntegrationRepository();
                    const moduleService = new ModuleService();

                    const getIntegrationInstance = new GetIntegrationInstance({
                        integrationRepository,
                        integrationClasses,
                        moduleService,
                    });

                    // todo: are we going to have the userId available here?
                    integrationInstance = await getIntegrationInstance.execute(params.integrationId, params.userId);
                    console.log(
                        `${params.event} for ${integrationInstance.record.config.type} of integrationId: ${params.integrationId}`
                    );
                }

                const res = await integrationInstance.send(params.event, {
                    data: params.data,
                    context,
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
