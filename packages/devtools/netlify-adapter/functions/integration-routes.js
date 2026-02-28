/**
 * Netlify Function: Integration-Defined Routes
 *
 * Handles custom routes defined on each Integration class via Definition.routes.
 * Routes are mounted at /api/{integrationName}-integration/*
 *
 * This is a single function that handles all integration-defined routes.
 * On AWS Lambda, each integration gets its own Lambda function. On Netlify,
 * we consolidate into one function for simplicity (can be split later if
 * cold starts become an issue).
 */
const { Router } = require('express');
const { loadAppDefinition } = require('@friggframework/core/handlers/app-definition-loader');
const { loadRouterFromObject } = require('@friggframework/core/handlers/backend-utils');
const {
    createNetlifyAppHandler,
} = require('../lib/create-netlify-app-handler');

const router = Router();
const { integrations: integrationClasses } = loadAppDefinition();

for (const IntegrationClass of integrationClasses) {
    if (!IntegrationClass.Definition.routes) continue;

    const basePath = `/api/${IntegrationClass.Definition.name}-integration`;

    for (const routeDef of IntegrationClass.Definition.routes) {
        if (typeof routeDef === 'function') {
            router.use(basePath, routeDef(IntegrationClass));
        } else if (typeof routeDef === 'object') {
            router.use(basePath, loadRouterFromObject(IntegrationClass, routeDef));
        } else if (routeDef && routeDef.stack) {
            // Express Router instance
            router.use(basePath, routeDef);
        }
    }
}

const handler = createNetlifyAppHandler(
    'HTTP Event: Integration Routes',
    router
);

module.exports = { handler };
