
class IntegrationEventDispatcher {
  constructor({ integrationRepository, moduleFactory, moduleRepository }) {
    this.integrationRepository = integrationRepository;
    this.moduleFactory = moduleFactory;
    this.moduleRepository = moduleRepository;
  }

  async dispatchHttp({ integrationClass, event, req, res, next }) {
    // Create or get integration instance
    const integration = await this.resolveIntegration(integrationClass);

    // Get the handler method from the integration's events object
    // The integration defines this.events = { EVENT_NAME: { handler: this.method.bind(this) } }
    const handler = this.findEventHandler(integration, event);

    if (!handler) {
      throw new Error(`Event ${event} not registered for ${integrationClass.Definition.name}`);
    }

    // Call the handler directly
    return await handler.call(integration, { req, res, next });
  }

  async dispatchJob({ integrationClass, event, data, context }) {
    const integration = await this.resolveIntegration(integrationClass);

    const handler = this.findEventHandler(integration, event);

    if (!handler) {
      throw new Error(`Event ${event} not registered for ${integrationClass.Definition.name}`);
    }

    return await handler.call(integration, { data, context });
  }

  findEventHandler(integration, event) {
    // First check if integration has events object
    if (integration.events && integration.events[event]) {
      return integration.events[event].handler;
    }

    // Check default events (ON_CREATE, ON_UPDATE, etc.)
    if (integration.defaultEvents && integration.defaultEvents[event]) {
      return integration.defaultEvents[event].handler;
    }

    return null;
  }

  async resolveIntegration(integrationClass) {
    let integrationInstance;

    try {
      // Try to get persisted integration from database
      const integrationRecord = await this.integrationRepository.findIntegrationByName(
        integrationClass.Definition.name
      );

      if (integrationRecord) {
        // Load with full database state and modules
        const entities = await this.moduleRepository.findEntitiesByIds(integrationRecord.entitiesIds);
        const modules = [];

        for (const entity of entities) {
          const moduleInstance = await this.moduleFactory.getModuleInstance(
            entity.id,
            integrationRecord.userId
          );
          modules.push(moduleInstance);
        }

        integrationInstance = new integrationClass({
          id: integrationRecord.id,
          userId: integrationRecord.userId,
          entities: entities,
          config: integrationRecord.config,
          status: integrationRecord.status,
          version: integrationRecord.version,
          messages: integrationRecord.messages,
          modules: modules
        });
      } else {
        // No DB record - create stateless instance for auth routes
        integrationInstance = new integrationClass({});
      }
    } catch (error) {
      // If DB lookup fails, create stateless instance
      integrationInstance = new integrationClass({});
    }

    // Initialize the integration (loads dynamic events if any)
    if (typeof integrationInstance.initialize === 'function') {
      await integrationInstance.initialize();
    }

    return integrationInstance;
  }
}

module.exports = { IntegrationEventDispatcher };