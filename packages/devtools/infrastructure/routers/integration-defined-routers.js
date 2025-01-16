const { createIntegrationRouter } = require('@friggframework/core');
const { createAppHandler } = require('./../app-handler-helpers');
const { requireLoggedInUser } = require('./middleware/requireLoggedInUser');
const {
    moduleFactory,
    integrationFactory,
    IntegrationHelper,
    loadRouterFromObject,
} = require('./../backend-utils');
const { Router } = require('express');

const handlers = {};
for (const IntegrationClass of integrationFactory.integrationClasses) {
    const router = Router();
    const basePath = `/api/${IntegrationClass.Definition.name}-integration`;
    console.log(`\n=== Routes for ${IntegrationClass.Definition.name} ===`);
    console.log(`Base path: ${basePath}`);
    
    for (const routeDef of IntegrationClass.Definition.routes) {
        if (typeof routeDef === 'function') {
            console.log('- Adding function-based route');
            router.use(basePath, routeDef(IntegrationClass));
        } else if (typeof routeDef === 'object') {
            console.log('- Adding object-based route:');
            console.log('  Path:', routeDef.path || '/');
            console.log('  Method:', routeDef.method || 'ALL');
            router.use(
                basePath,
                loadRouterFromObject(IntegrationClass, routeDef)
            );
        } else if (routeDef instanceof express.Router) {
            console.log('- Adding Express Router route');
            router.use(basePath, routeDef);
        }
    }
    console.log('=====================================\n');

    handlers[`${IntegrationClass.Definition.name}`] = {
        handler: createAppHandler(
            `HTTP Event: ${IntegrationClass.Definition.name}`,
            router
        ),
    };
}

module.exports = { handlers };
