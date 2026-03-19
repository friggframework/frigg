import type { Request, Response, NextFunction } from 'express';

export interface IntegrationInstance {
    events?: Record<string, { handler: (...args: any[]) => any }>;
    defaultEvents?: Record<string, { handler: (...args: any[]) => any }>;
    constructor?: { Definition?: { name?: string } };
}

export interface DispatchHttpParams {
    event: string;
    req: Request;
    res: Response;
    next: NextFunction;
}

export interface DispatchJobParams {
    event: string;
    data: unknown;
    context: unknown;
}

/**
 * Lightweight dispatcher that executes integration event handlers.
 */
export class IntegrationEventDispatcher {
    integrationInstance: IntegrationInstance;

    constructor(integrationInstance: IntegrationInstance) {
        if (!integrationInstance) {
            throw new Error('Integration instance is required');
        }
        this.integrationInstance = integrationInstance;
    }

    async dispatchHttp({ event, req, res, next }: DispatchHttpParams): Promise<unknown> {
        const instance = this.integrationInstance;

        const handler = this.findEventHandler(instance, event);

        if (!handler) {
            const name =
                instance.constructor?.Definition?.name || 'integration';
            throw new Error(`Event ${event} not registered for ${name}`);
        }

        return await handler.call(instance, { req, res, next });
    }

    async dispatchJob({ event, data, context }: DispatchJobParams): Promise<unknown> {
        const instance = this.integrationInstance;

        const handler = this.findEventHandler(instance, event);

        if (!handler) {
            const name =
                instance.constructor?.Definition?.name || 'integration';
            throw new Error(`Event ${event} not registered for ${name}`);
        }

        return await handler.call(instance, { data, context });
    }

    findEventHandler(
        integration: IntegrationInstance,
        event: string
    ): ((...args: any[]) => any) | null {
        if (integration.events && integration.events[event]) {
            return integration.events[event].handler;
        }

        if (integration.defaultEvents && integration.defaultEvents[event]) {
            return integration.defaultEvents[event].handler;
        }

        return null;
    }
}

