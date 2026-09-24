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

// Serverless function keys must be alphanumeric; binding keys are developer-chosen.
const sanitizeBindingKey = (name) => String(name).replace(/[^A-Za-z0-9]/g, '');

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

    // Each extension binding gets its own namespaced handler (/{bindingName}),
    // so two modules' extensions can share a path like /webhooks without colliding.
    const bindingGroups = new Map();
    for (const extRoute of getExtensionRoutes(IntegrationClass)) {
        const namespacedPath = `/${extRoute.bindingName}${extRoute.path}`;
        claim(
            extRoute.method,
            namespacedPath,
            `extension "${extRoute.extensionName}" (binding "${extRoute.bindingName}")`
        );
        if (!bindingGroups.has(extRoute.bindingName)) {
            bindingGroups.set(extRoute.bindingName, {
                router: Router(),
                useDatabase: extRoute.useDatabase,
            });
        }
        const group = bindingGroups.get(extRoute.bindingName);
        group.router.use(
            `${basePath}/${extRoute.bindingName}`,
            loadRouterFromObject(IntegrationClass, extRoute)
        );
        console.log(
            `│ ${extRoute.method.toUpperCase()} ${basePath}/${extRoute.bindingName}${extRoute.path}  (extension: ${extRoute.extensionName}, useDatabase: ${extRoute.useDatabase})`
        );
    }
    console.log('│');

    handlers[`${IntegrationClass.Definition.name}`] = {
        handler: createAppHandler(
            `HTTP Event: ${IntegrationClass.Definition.name}`,
            router
        ),
    };

    for (const [bindingName, group] of bindingGroups) {
        // Wire contract: integration-builder.js (devtools) derives the identical
        // function key for the serverless config. Keep both in sync.
        const fnKey = `${IntegrationClass.Definition.name}__${sanitizeBindingKey(
            bindingName
        )}`;
        // Distinct binding keys can sanitize to the same fnKey — fail loud rather than overwrite.
        if (Object.prototype.hasOwnProperty.call(handlers, fnKey)) {
            throw new Error(
                `Integration "${IntegrationClass.Definition.name}" extension handler conflict: ` +
                    `binding "${bindingName}" sanitizes to "${fnKey}", which is already taken. ` +
                    `Use binding keys that are distinct after stripping non-alphanumeric characters.`
            );
        }
        handlers[fnKey] = {
            handler: createAppHandler(
                `HTTP Event: ${IntegrationClass.Definition.name} extension ${bindingName}`,
                group.router,
                group.useDatabase
            ),
        };
    }
}

module.exports = { handlers };
