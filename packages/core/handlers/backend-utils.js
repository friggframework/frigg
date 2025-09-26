const { Router } = require('express');
const { Worker } = require('@friggframework/core');
const { IntegrationRepository } = require('../integrations/integration-repository');
const { ModuleFactory } = require('../modules/module-factory');
const { getModulesDefinitionFromIntegrationClasses } = require('../integrations/utils/map-integration-dto');
const { ModuleRepository } = require('../modules/module-repository');
const { IntegrationEventDispatcher } = require('./integration-event-dispatcher');

const loadRouterFromObject = (IntegrationClass, routerObject) => {

    const integrationRepository = new IntegrationRepository();
    const moduleRepository = new ModuleRepository();
    const moduleFactory = new ModuleFactory({
        moduleRepository,
        moduleDefinitions: getModulesDefinitionFromIntegrationClasses([IntegrationClass]),
    });

    // Create the event dispatcher
    const dispatcher = new IntegrationEventDispatcher({
        integrationRepository,
        moduleFactory,
        moduleRepository,
    });

    const router = Router();
    const { path, method, event } = routerObject;

    console.log(
        `Registering ${method} ${path} for ${IntegrationClass.Definition.name}`
    );

    router[method.toLowerCase()](path, async (req, res, next) => {
        try {
            const result = await dispatcher.dispatchHttp({
                integrationClass: IntegrationClass,
                event,
                req,
                res,
                next
            });
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

        integrationRepository = new IntegrationRepository();
        moduleRepository = new ModuleRepository();
        moduleFactory = new ModuleFactory({
            moduleRepository: this.moduleRepository,
            moduleDefinitions: getModulesDefinitionFromIntegrationClasses([integrationClass]),
        });

        dispatcher = new IntegrationEventDispatcher({
            integrationRepository: this.integrationRepository,
            moduleFactory: this.moduleFactory,
            moduleRepository: this.moduleRepository,
        });

        async _run(params, context) {
            try {
                const res = await this.dispatcher.dispatchJob({
                    integrationClass: integrationClass,
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
