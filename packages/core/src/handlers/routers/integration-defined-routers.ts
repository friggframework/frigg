import { Router } from 'express';
import { createAppHandler } from '../app-handler-helpers';
import { loadAppDefinition } from '../app-definition-loader';
import { loadRouterFromObject } from '../backend-utils';
import type { IntegrationClass } from '../app-definition-loader';

interface HandlerEntry {
    handler: (event: any, context: any) => Promise<any>;
}

const handlers: Record<string, HandlerEntry> = {};
const { integrations: integrationClasses } = loadAppDefinition();

//todo: this should be in a use case class
for (const IntegrationClass of integrationClasses) {
    const router = Router();
    const basePath = `/api/${IntegrationClass.Definition.name}-integration`;

    console.log(`\n│ Configuring routes for ${IntegrationClass.Definition.name} Integration:`);

    for (const routeDef of (IntegrationClass.Definition.routes || [])) {
        if (typeof routeDef === 'function') {
            router.use(basePath, routeDef(IntegrationClass));
            console.log(`│ ANY ${basePath}/* (function handler)`);
        } else if (typeof routeDef === 'object' && routeDef !== null && typeof (routeDef as any).handle === 'function') {
            // Express router (has a .handle method)
            router.use(basePath, routeDef as any);
            console.log(`│ ANY ${basePath}/* (express router)`);
        } else if (typeof routeDef === 'object' && routeDef !== null) {
            router.use(
                basePath,
                loadRouterFromObject(IntegrationClass as IntegrationClass, routeDef as any)
            );
            const method = ((routeDef as any).method || 'ANY').toUpperCase();
            const fullPath = `${basePath}${(routeDef as any).path}`;
            console.log(`│ ${method} ${fullPath}`);
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

export { handlers };

