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
                const integrationInstance = new integrationClass();
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
