const Boom = require('@hapi/boom');
const { ModuleConstants } = require('../ModuleConstants');
const { usedByOf } = require('../entity-type-registry');

const AUTH_TYPE_BY_REQUESTER = {
    [ModuleConstants.authType.oauth2]: 'oauth2',
    [ModuleConstants.authType.oauth1]: 'oauth1',
    [ModuleConstants.authType.apiKey]: 'api-key',
    [ModuleConstants.authType.basic]: 'basic',
};

const callIfFunction = (target, name) =>
    typeof target?.[name] === 'function' ? target[name]() : undefined;

/** Number of authorization steps a module declares (1 unless multi-step). */
function getAuthStepCount(definition) {
    const count = callIfFunction(definition, 'getAuthStepCount');
    return Number.isInteger(count) && count > 0 ? count : 1;
}

/**
 * Public description of an API module (an "entity type"). Reads only the
 * definition: display metadata, auth type and step count. Never credentials
 * or env values.
 */
function describeEntityType(definition, typeName = definition.moduleName) {
    const stepCount = getAuthStepCount(definition);
    const display = definition.display || {};
    const description = {
        type: typeName,
        name:
            callIfFunction(definition, 'getDisplayName') ??
            display.label ??
            display.name ??
            typeName,
        authType:
            callIfFunction(definition, 'getAuthType') ??
            AUTH_TYPE_BY_REQUESTER[definition.API?.requesterType] ??
            'custom',
        isMultiStep: stepCount > 1,
        stepCount,
    };
    const text = callIfFunction(definition, 'getDescription') ?? display.description;
    if (text) description.description = text;
    const capabilities = callIfFunction(definition, 'getCapabilities');
    if (capabilities !== undefined) description.capabilities = capabilities;
    return description;
}

function findDefinition(moduleDefinitions, entityType) {
    const definition = moduleDefinitions.find(
        (def) => def.moduleName === entityType
    );
    if (!definition) {
        throw Boom.notFound(`Entity type '${entityType}' not found`, {
            code: 'ENTITY_TYPE_NOT_FOUND',
        });
    }
    return definition;
}

const describeEntry = (name, entry) => ({
    // The registry key is the name the API uses, whatever the definition spells.
    ...describeEntityType(entry.definition, name),
    usedBy: usedByOf(entry),
});

function requireRegistry(entityTypeRegistry) {
    if (!(entityTypeRegistry instanceof Map)) {
        throw new TypeError('entityTypeRegistry is required (see getEntityTypeRegistry)');
    }
    return entityTypeRegistry;
}

/**
 * Lists the entity types this app can authorize: registry entries plus every
 * module an integration binds (ADR-059). `usedBy` names the integrations that
 * bind each type; it is empty for a registry-only type.
 */
class ListEntityTypes {
    constructor({ entityTypeRegistry }) {
        this.registry = requireRegistry(entityTypeRegistry);
    }

    async execute() {
        return [...this.registry]
            .map(([name, entry]) => describeEntry(name, entry))
            .sort((a, b) => a.name.localeCompare(b.name));
    }
}

/** Describes one entity type, looked up by its registry key; 404 when absent. */
class GetEntityType {
    constructor({ entityTypeRegistry }) {
        this.registry = requireRegistry(entityTypeRegistry);
    }

    async execute(entityType) {
        const entry = this.registry.get(entityType);
        if (!entry) {
            throw Boom.notFound(`Entity type '${entityType}' not found`, {
                code: 'ENTITY_TYPE_NOT_FOUND',
            });
        }
        return describeEntry(entityType, entry);
    }
}

module.exports = {
    ListEntityTypes,
    GetEntityType,
    describeEntityType,
    getAuthStepCount,
    findDefinition,
};
