const { Router } = require('express');
const { Worker } = require('@friggframework/core');
const { IntegrationRepository } = require('../integrations/integration-repository');
const { ModuleFactory } = require('../modules/module-factory');
const { getModulesDefinitionFromIntegrationClasses } = require('../integrations/utils/map-integration-dto');
const { ModuleRepository } = require('../modules/module-repository');
const { GetIntegrationInstanceByDefinition } = require('../integrations/use-cases/get-integration-instance-by-definition');

const loadRouterFromObject = (IntegrationClass, routerObject) => {

    const integrationRepository = new IntegrationRepository();
    const moduleRepository = new ModuleRepository();
    const moduleFactory = new ModuleFactory({
        moduleRepository,
        moduleDefinitions: getModulesDefinitionFromIntegrationClasses([IntegrationClass]),
    });
    const router = Router();
    const { path, method, event } = routerObject;

    console.log(
        `Registering ${method} ${path} for ${IntegrationClass.Definition.name}`
    );

    router[method.toLowerCase()](path, async (req, res, next) => {
        try {
            const getIntegrationInstanceByDefinition = new GetIntegrationInstanceByDefinition({
                integrationRepository,
                moduleFactory,
                moduleRepository,
            });
            const integration = await getIntegrationInstanceByDefinition.execute(IntegrationClass);
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

        integrationRepository = new IntegrationRepository();
        moduleRepository = new ModuleRepository();
        moduleFactory = new ModuleFactory({
            moduleRepository: this.moduleRepository,
            moduleDefinitions: getModulesDefinitionFromIntegrationClasses([integrationClass]),
        });

        async _run(params, context) {
            try {
                const getIntegrationInstanceByDefinition = new GetIntegrationInstanceByDefinition({
                    integrationRepository: this.integrationRepository,
                    moduleFactory: this.moduleFactory,
                    moduleRepository: this.moduleRepository,
                });

                const integration = await getIntegrationInstanceByDefinition.execute(integrationClass);

                const res = await integration.send(params.event, {
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
