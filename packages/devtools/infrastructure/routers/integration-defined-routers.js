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
integrationFactory.integrationClasses.forEach((IntegrationClass) => {
    const router = Router();
    const basePath = `/api/${IntegrationClass.Definition.name}-integration`;
    IntegrationClass.Definition.routes.forEach((routeDef) => {
        if (typeof routeDef === 'function') {
            router.use(basePath, routeDef(IntegrationClass));
        } else if (typeof routeDef === 'object') {
            router.use(
                basePath,
                loadRouterFromObject(IntegrationClass, routeDef)
            );
        } else if (routeDef instanceof express.Router) {
            router.use(basePath, routeDef);
        }
    });

    handlers[`${IntegrationClass.Definition.name}`] = {
        handler: createAppHandler(
            `HTTP Event: ${IntegrationClass.Definition.name}`,
            router
        ),
    };
});

module.exports = { handlers };
