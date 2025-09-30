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
        const instance = this.integrationInstance;

        const handler = this.findEventHandler(instance, event);

        if (!handler) {
            const name =
                instance.constructor?.Definition?.name || 'integration';
            throw new Error(`Event ${event} not registered for ${name}`);
        }

        return await handler.call(instance, { req, res, next });
    }

    async dispatchJob({ event, data, context }) {
        const instance = this.integrationInstance;

        const handler = this.findEventHandler(instance, event);

        if (!handler) {
            const name =
                instance.constructor?.Definition?.name || 'integration';
            throw new Error(`Event ${event} not registered for ${name}`);
        }

        return await handler.call(instance, { data, context });
    }

    findEventHandler(integration, event) {
        if (integration.events && integration.events[event]) {
            return integration.events[event].handler;
        }

        if (integration.defaultEvents && integration.defaultEvents[event]) {
            return integration.defaultEvents[event].handler;
        }

        return null;
    }
}

module.exports = { IntegrationEventDispatcher };
