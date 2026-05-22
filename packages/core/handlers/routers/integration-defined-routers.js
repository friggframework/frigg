const { createAppHandler } = require('./../app-handler-helpers');
const {
    loadAppDefinition,
} = require('../app-definition-loader');
const express = require('express');
const { Router } = express;
const { loadRouterFromObject } = require('../backend-utils');
const { getExtensionRoutes } = require('../../integrations/extension');

const handlers = {};
const { integrations: integrationClasses } = loadAppDefinition();

const routeKey = (method, path) => `${(method || 'ANY').toUpperCase()} ${path}`;

//todo: this should be in a use case class
for (const IntegrationClass of integrationClasses) {
    const router = Router();
    const basePath = `/api/${IntegrationClass.Definition.name}-integration`;
    // Track (method, path) tuples to fail fast on conflicts between Definition.routes,
    // extension routes, or two extensions claiming the same path.
    const claimedRoutes = new Map();
    const claim = (method, path, source) => {
        const key = routeKey(method, path);
        if (claimedRoutes.has(key)) {
            const prev = claimedRoutes.get(key);
            throw new Error(
                `Integration "${IntegrationClass.Definition.name}" route conflict: ` +
                    `${key} declared by ${prev} and ${source}`
            );
        }
        claimedRoutes.set(key, source);
    };

    console.log(`\n│ Configuring routes for ${IntegrationClass.Definition.name} Integration:`);

    const routes = IntegrationClass.Definition.routes || [];
    for (const routeDef of routes) {
        if (typeof routeDef === 'function') {
            router.use(basePath, routeDef(IntegrationClass));
            console.log(`│ ANY ${basePath}/* (function handler)`);
        } else if (routeDef instanceof express.Router) {
            router.use(basePath, routeDef);
            console.log(`│ ANY ${basePath}/* (express router)`);
        } else if (typeof routeDef === 'object') {
            claim(routeDef.method, routeDef.path, 'Definition.routes');
            router.use(
                basePath,
                loadRouterFromObject(IntegrationClass, routeDef)
            );
            const method = (routeDef.method || 'ANY').toUpperCase();
            const fullPath = `${basePath}${routeDef.path}`;
            console.log(`│ ${method} ${fullPath}`);
        }
    }

    // Tier 3 Integration Extension routes — see EXTENSIONS.md
    for (const extRoute of getExtensionRoutes(IntegrationClass)) {
        claim(
            extRoute.method,
            extRoute.path,
            `extension "${extRoute.extensionName}" (binding "${extRoute.bindingName}")`
        );
        router.use(
            basePath,
            loadRouterFromObject(IntegrationClass, extRoute)
        );
        const method = extRoute.method.toUpperCase();
        console.log(
            `│ ${method} ${basePath}${extRoute.path}  (extension: ${extRoute.extensionName})`
        );
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
