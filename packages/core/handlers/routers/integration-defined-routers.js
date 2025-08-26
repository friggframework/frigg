const { createAppHandler } = require('./../app-handler-helpers');
const {
    integrationFactory,
    loadRouterFromObject,
} = require('./../backend-utils');
const { Router } = require('express');

const handlers = {};
for (const IntegrationClass of integrationFactory.integrationClasses) {
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
