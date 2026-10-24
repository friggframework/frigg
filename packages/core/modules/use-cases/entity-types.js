const Boom = require('@hapi/boom');
const { ModuleConstants } = require('../ModuleConstants');

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
function describeEntityType(definition) {
    const stepCount = getAuthStepCount(definition);
    const display = definition.display || {};
    const description = {
        type: definition.moduleName,
        name:
            callIfFunction(definition, 'getDisplayName') ??
            display.label ??
            display.name ??
            definition.moduleName,
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

/** Lists the entity types (API modules) this app can authorize. */
class ListEntityTypes {
    constructor({ moduleDefinitions }) {
        this.moduleDefinitions = moduleDefinitions || [];
    }

    async execute() {
        return this.moduleDefinitions
            .map(describeEntityType)
            .sort((a, b) => a.name.localeCompare(b.name));
    }
}

/** Describes one entity type; 404 when the app does not configure it. */
class GetEntityType {
    constructor({ moduleDefinitions }) {
        this.moduleDefinitions = moduleDefinitions || [];
    }

    async execute(entityType) {
        return describeEntityType(findDefinition(this.moduleDefinitions, entityType));
    }
}

module.exports = {
    ListEntityTypes,
    GetEntityType,
    describeEntityType,
    getAuthStepCount,
    findDefinition,
};
