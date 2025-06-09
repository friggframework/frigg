const { findNearestBackendPackageJson } = require('@friggframework/core/utils');
const path = require('node:path');
const fs = require('fs-extra');
const { Router } = require('express');
const { Worker } = require('@friggframework/core');


/**
 * Loads the App definition from the nearest backend package
 * @function loadAppDefinition
 * @description Searches for the nearest backend package.json, loads the corresponding index.js file,
 * and extracts the application definition containing integrations and user configuration.
 * @returns {{integrations: Array<object>, userConfig: object | null}} An object containing the application definition.
 * @throws {Error} Throws error if backend package.json cannot be found.
 * @throws {Error} Throws error if index.js file cannot be found in the backend directory.
 * @example
 * const { integrations, userConfig } = loadAppDefinition();
 * console.log(`Found ${integrations.length} integrations`);
 */
function loadAppDefinition() {
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
    const appDefinition = backendJsFile.Definition;

    const { integrations = [], user: userConfig = null } = appDefinition;
    return { integrations, userConfig };
}

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
            const result = await integration.send(event, { req, res, next });
            res.json(result);
        } catch (error) {
            next(error);
        }
    });

    return router;
};

//todo: this should be in a use case class
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
    loadRouterFromObject,
    createQueueWorker,
    loadAppDefinition,
};
