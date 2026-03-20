import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createAppHandler } from '../app-handler-helpers';
import { loadAppDefinition } from '../app-definition-loader';
import { IntegrationEventDispatcher } from '../integration-event-dispatcher';

interface HandlerEntry {
    handler: (event: any, context: any) => Promise<any>;
}

const handlers: Record<string, HandlerEntry> = {};
const { integrations: integrationClasses } = loadAppDefinition();

for (const IntegrationClass of integrationClasses) {
    const webhookConfig = IntegrationClass.Definition.webhooks;

    // Skip if webhooks not enabled
    if (!webhookConfig || (typeof webhookConfig === 'object' && !(webhookConfig as any).enabled)) {
        continue;
    }

    const router = Router();
    const basePath = `/api/${IntegrationClass.Definition.name}-integration/webhooks`;

    console.log(`\n│ Configuring webhook routes for ${IntegrationClass.Definition.name}:`);

    // General webhook route (no integration ID)
    router.post(basePath, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const integrationInstance = new IntegrationClass();
            const dispatcher = new IntegrationEventDispatcher(integrationInstance);
            await dispatcher.dispatchHttp({
                event: 'WEBHOOK_RECEIVED',
                req,
                res,
                next,
            });
        } catch (error) {
            next(error);
        }
    });
    console.log(`│ POST ${basePath}`);

    // Integration-specific webhook route (with integration ID)
    router.post(`${basePath}/:integrationId`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const integrationInstance = new IntegrationClass();
            const dispatcher = new IntegrationEventDispatcher(integrationInstance);
            await dispatcher.dispatchHttp({
                event: 'WEBHOOK_RECEIVED',
                req,
                res,
                next,
            });
        } catch (error) {
            next(error);
        }
    });
    console.log(`│ POST ${basePath}/:integrationId`);
    console.log('│');

    handlers[`${IntegrationClass.Definition.name}Webhook`] = {
        handler: createAppHandler(
            `HTTP Event: ${IntegrationClass.Definition.name} Webhook`,
            router,
            false  // shouldUseDatabase = false
        ),
    };
}

export { handlers };

