const { instrumentHandler } = require('../telemetry/instrument-handler');

/**
 * Lightweight dispatcher that executes integration event handlers.
 * @param {import('../integrations/integration-base')} integrationInstance Pre-instantiated integration.
 */
class IntegrationEventDispatcher {
    constructor(integrationInstance) {
        if (!integrationInstance) {
            throw new Error('Integration instance is required');
        }
        this.integrationInstance = integrationInstance;
    }

    async dispatchHttp({ event, req, res, next }) {
        return this._dispatch(event, (instance, handler) =>
            handler.call(instance, { req, res, next })
        );
    }

    async dispatchJob({ event, data, context }) {
        return this._dispatch(event, (instance, handler) =>
            handler.call(instance, { data, context })
        );
    }

    /**
     * Resolve + invoke a handler, auto-instrumented (ADR-011 Decision 2). This
     * is the seam for queue/webhook/defined-route dispatch; the `this.on` path
     * (user actions, lifecycle) is instrumented in IntegrationBase.send().
     */
    async _dispatch(event, invoke) {
        const instance = this.integrationInstance;
        const handler = this.findEventHandler(instance, event);

        if (!handler) {
            const name =
                instance.constructor?.Definition?.name || 'integration';
            throw new Error(`Event ${event} not registered for ${name}`);
        }

        const eventDef = this.findEventDef(instance, event);
        const context =
            typeof instance.getTelemetryContext === 'function'
                ? instance.getTelemetryContext()
                : {};

        return instrumentHandler(
            instance.telemetry,
            context,
            { event, eventType: eventDef?.type },
            () => invoke(instance, handler)
        );
    }

    findEventHandler(integration, event) {
        return this.findEventDef(integration, event)?.handler || null;
    }

    findEventDef(integration, event) {
        if (integration.events && integration.events[event]) {
            return integration.events[event];
        }

        if (integration.defaultEvents && integration.defaultEvents[event]) {
            return integration.defaultEvents[event];
        }

        return null;
    }
}

module.exports = { IntegrationEventDispatcher };
