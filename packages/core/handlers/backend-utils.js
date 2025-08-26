const { createFriggBackend, Worker } = require('@friggframework/core');
const { findNearestBackendPackageJson } = require('@friggframework/core/utils');
const path = require('node:path');
const fs = require('fs-extra');

const backendPath = findNearestBackendPackageJson();
if (!backendPath) {
    throw new Error('Could not find backend package.json');
}

const backendDir = path.dirname(backendPath);
const backendFilePath = path.join(backendDir, 'index.js');
if (!fs.existsSync(backendFilePath)) {
    throw new Error('Could not find index.js');
}

const backendJsFile = require(backendFilePath);
const { Router } = require('express');
const appDefinition = backendJsFile.Definition;

const backend = createFriggBackend(appDefinition);
const loadRouterFromObject = (IntegrationClass, routerObject) => {
    const router = Router();
    const { path, method, event } = routerObject;
    console.log(
        `Registering ${method} ${path} for ${IntegrationClass.Definition.name}`
    );
    router[method.toLowerCase()](path, async (req, res, next) => {
        try {
            const integration = new IntegrationClass({});
            await integration.loadModules();
            await integration.registerEventHandlers();
            const result = await integration.send(event, {req, res, next});
            res.json(result);
        } catch (error) {
            next(error);
        }
    });

    return router;
};
const createQueueWorker = (integrationClass, integrationFactory) => {
    class QueueWorker extends Worker {
        async _run(params, context) {
            try {
                let instance;
                if (!params.integrationId) {
                    instance = new integrationClass({});
                    await instance.loadModules();
                    // await instance.loadUserActions();
                    await instance.registerEventHandlers();
                    console.log(
                        `${params.event} for ${integrationClass.Definition.name} integration with no integrationId`
                    );
                } else {
                    instance =
                        await integrationFactory.getInstanceFromIntegrationId({
                            integrationId: params.integrationId,
                        });
                    console.log(
                        `${params.event} for ${instance.record.config.type} of integrationId: ${params.integrationId}`
                    );
                }
                const res = await instance.send(params.event, {
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
    ...backend,
    loadRouterFromObject,
    createQueueWorker,
};
