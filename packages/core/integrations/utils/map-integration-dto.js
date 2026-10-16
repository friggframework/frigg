/**
 * @param {import('../integration').Integration} integration
 * Convert an Integration domain instance to a plain DTO suitable for JSON responses.
 * Can also accept a plain object with an 'options' property to avoid unnecessary instantiation.
 */
function mapIntegrationClassToIntegrationDTO(integration) {
    if (!integration) return null;

    return {
        id: integration.id,
        userId: integration.userId,
        entities: integration.entities,
        config: integration.config,
        status: integration.status,
        version: integration.version,
        messages: integration.messages,
        userActions: integration.userActions,
        options: integration.options || (typeof integration.getOptionDetails === 'function' ? integration.getOptionDetails() : null),
    };
}

let deprecationLogged = false;

/**
 * @deprecated Since ADR-059. Read `entityTypeRegistry` / `moduleDefinitions`
 * from `loadAppDefinition()`, or call `getEntityTypeRegistry(appDefinition)`
 * and read each entry's `definition`.
 *
 * Kept as a wrapper over the entity type registry so callers that imported it
 * keep working. It returns the registry's definitions, so it follows the
 * registry's rules: one definition per entity type name (the first wins when
 * two integrations bind different definitions under one name, as
 * ModuleFactory already picked), and, when `entities` is passed, registry-only
 * types are included and conflicts throw `EntityRegistryError`.
 *
 * @param {Array<Function>} integrationClasses - integration classes
 * @param {Object} [entities] - `appDefinition.entities` (ADR-059)
 * @returns {Array<Object>} API module definitions
 */
function getModulesDefinitionFromIntegrationClasses(
    integrationClasses,
    entities
) {
    // Required here, not at the top: modules/ must not load at require time
    // of every integration use case that only wants the DTO mapper.
    const {
        getEntityTypeRegistry,
        getEntityTypeDefinitions,
    } = require('../../modules/entity-type-registry');
    if (!deprecationLogged) {
        deprecationLogged = true;
        const { getLogger } = require('../../logs');
        getLogger('frigg.integrations').warn(
            'getModulesDefinitionFromIntegrationClasses is deprecated; use getEntityTypeRegistry (ADR-059)',
            { eventName: 'frigg.integrations.deprecated_module_definitions' }
        );
    }
    return getEntityTypeDefinitions(
        getEntityTypeRegistry({ integrations: integrationClasses, entities })
    );
}

module.exports = {
    mapIntegrationClassToIntegrationDTO,
    getModulesDefinitionFromIntegrationClasses,
};
