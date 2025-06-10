const { createAppHandler } = require('./../app-handler-helpers');
const {
    loadAppDefinition,
} = require('../app-definition-loader');
const { Router } = require('express');
const { loadRouterFromObject } = require('../backend-utils');

const handlers = {};
const { integrations: integrationClasses } = loadAppDefinition();

//todo: this should be in a use case class
for (const IntegrationClass of integrationClasses) {
    const router = Router();
    const basePath = `/api/${IntegrationClass.Definition.name}-integration`;

    console.log(`\n│ Configuring routes for ${IntegrationClass.Definition.name} Integration:`);

    for (const routeDef of IntegrationClass.Definition.routes) {
        if (typeof routeDef === 'function') {
            router.use(basePath, routeDef(IntegrationClass));
            console.log(`│ ANY ${basePath}/* (function handler)`);
        } else if (typeof routeDef === 'object') {
            router.use(
                basePath,
                loadRouterFromObject(IntegrationClass, routeDef)
            );
            const method = (routeDef.method || 'ANY').toUpperCase();
            const fullPath = `${basePath}${routeDef.path}`;
            console.log(`│ ${method} ${fullPath}`);
        } else if (routeDef instanceof express.Router) {
            router.use(basePath, routeDef);
            console.log(`│ ANY ${basePath}/* (express router)`);
        }
    }
    console.log('│');

    handlers[`${IntegrationClass.Definition.name}`] = {
        handler: createAppHandler(
            `HTTP Event: ${IntegrationClass.Definition.name}`,
            router
        ),
    };
}

module.exports = { handlers };
