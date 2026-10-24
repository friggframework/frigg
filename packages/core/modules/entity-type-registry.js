/**
 * App-level entity type registry (ADR-059).
 *
 * Pure: reads an app definition, does no I/O. It answers "which entity types
 * (API modules) can this app connect?" from two sources:
 *
 *   1. `appDefinition.entities`, an object keyed by entity type name whose
 *      values are `{ definition, scope?, proxy?, display? }`.
 *   2. Inference: every module bound by `appDefinition.integrations[*]
 *      .Definition.modules` (skipped when `entities.$infer === false`).
 *
 * `loadAppDefinition()` builds the registry once, at load, and returns it as
 * `entityTypeRegistry` / `moduleDefinitions`; every consumer that holds a
 * loaded app definition reads those instead of rebuilding.
 */

const { BaseError } = require('../errors/base-error');
const { getLogger } = require('../logs');

const log = getLogger('frigg.modules.entity_registry');

const INFER_KEY = '$infer';
const UNNAMED = '(unnamed definition)';

/**
 * Raised for an invalid `entities` registry. `code` is always
 * `ENTITY_REGISTRY_INVALID`, so callers can tell it from other load errors.
 */
class EntityRegistryError extends BaseError {
    constructor(message, options) {
        super(message, options);
        this.code = 'ENTITY_REGISTRY_INVALID';
    }
}

const isPlainObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const appSource = () => ({ kind: 'app' });
const integrationSource = (integrationClass) => ({
    kind: 'integration',
    name: integrationClass?.Definition?.name || 'unnamed',
});
const describeSource = (source) =>
    source.kind === 'app' ? 'app' : `integration:${source.name}`;

const safeGetName = (definition) => {
    if (typeof definition.getName !== 'function') return undefined;
    try {
        const name = definition.getName();
        return typeof name === 'string' && name ? name : undefined;
    } catch {
        return undefined;
    }
};

const moduleNameOf = (definition) =>
    typeof definition?.moduleName === 'string' && definition.moduleName
        ? definition.moduleName
        : undefined;

/** The name an entity type is known by: moduleName, else getName(). */
function entityTypeNameOf(definition) {
    if (!definition) return undefined;
    return moduleNameOf(definition) ?? safeGetName(definition);
}

/** Same object, or the same package name and version when both can be read. */
function isSameDefinition(a, b) {
    if (a === b) return true;
    const packageId = (definition) => {
        const { packageName, version } = definition || {};
        return typeof packageName === 'string' &&
            packageName &&
            typeof version === 'string' &&
            version
            ? `${packageName}@${version}`
            : null;
    };
    const left = packageId(a);
    return left !== null && left === packageId(b);
}

function conflictError(name, existing, source) {
    return new EntityRegistryError(
        `Entity type '${name}' is supplied by two different definitions: ` +
            `${existing.sources
                .map(describeSource)
                .join(', ')} and ${describeSource(source)}. ` +
            'They must be the same definition object (or the same package name and version).'
    );
}

/**
 * A registry key must equal the definition's moduleName and, when it has one,
 * its getName(). Case matters. This leaves one name per entity type.
 */
function assertKeyMatchesDefinition(key, definition) {
    const moduleName = moduleNameOf(definition);
    const getName = safeGetName(definition);
    const matches =
        (moduleName !== undefined || getName !== undefined) &&
        (moduleName === undefined || key === moduleName) &&
        (getName === undefined || key === getName);
    if (!matches) {
        throw new EntityRegistryError(
            `appDefinition.entities key '${key}' does not match its definition's name ` +
                `(moduleName '${moduleName ?? '(none)'}', getName() '${
                    getName ?? '(none)'
                }'). ` +
                'The key must equal both, so each entity type has one name.'
        );
    }
}

const settingsOf = (entry) => {
    const settings = {};
    for (const field of ['scope', 'proxy', 'display']) {
        if (entry[field] !== undefined) settings[field] = entry[field];
    }
    return settings;
};

/**
 * `entities` absent keeps today's behaviour: inference on, and a name clash
 * between integrations is not fatal. `entities` present (even `{}`) opts in to
 * the strict rules.
 */
function readEntities(appDefinition) {
    const entities = appDefinition?.entities;
    if (entities === undefined || entities === null) {
        return { strict: false, infer: true, entries: [] };
    }
    if (!isPlainObject(entities)) {
        throw new EntityRegistryError(
            'appDefinition.entities must be an object keyed by entity type name'
        );
    }
    const { [INFER_KEY]: inferFlag, ...rest } = entities;
    if (inferFlag !== undefined && typeof inferFlag !== 'boolean') {
        throw new EntityRegistryError(
            `appDefinition.entities.${INFER_KEY} must be a boolean`
        );
    }
    return {
        strict: true,
        infer: inferFlag !== false,
        entries: Object.entries(rest),
    };
}

function registerAppEntries(registry, entries) {
    for (const [key, entry] of entries) {
        if (
            !isPlainObject(entry) ||
            !entry.definition ||
            typeof entry.definition !== 'object'
        ) {
            throw new EntityRegistryError(
                `appDefinition.entities.${key} must be an object with a 'definition'`
            );
        }
        assertKeyMatchesDefinition(key, entry.definition);
        registry.set(key, {
            definition: entry.definition,
            sources: [appSource()],
            settings: settingsOf(entry),
        });
    }
}

function* boundDefinitions(integrationClass) {
    const modules = integrationClass?.Definition?.modules;
    if (!isPlainObject(modules)) return;
    for (const bound of Object.values(modules)) {
        if (bound?.definition) yield bound.definition;
    }
}

const addSource = (entry, source) => {
    const known = entry.sources.some(
        (s) => s.kind === source.kind && s.name === source.name
    );
    if (!known) entry.sources.push(source);
};

/**
 * Folds one integration-bound definition into the registry. Returns the name
 * it could not register (only possible when inference is off), else undefined.
 */
function mergeBoundDefinition(registry, definition, source, { strict, infer }) {
    const name = entityTypeNameOf(definition);

    if (!name) {
        // No moduleName / getName(): it cannot be keyed by name. Offering it
        // as before, de-duplicated by identity, keeps apps that never named
        // one working. It cannot be registered, so `$infer: false` rejects it.
        if (!infer) return UNNAMED;
        const known = [...registry.values()].find(
            (entry) => entry.definition === definition
        );
        if (known) addSource(known, source);
        else {
            registry.set(`${UNNAMED} #${registry.size}`, {
                definition,
                sources: [source],
                settings: {},
            });
        }
        return undefined;
    }

    const existing = registry.get(name);
    if (existing) {
        if (isSameDefinition(existing.definition, definition)) {
            addSource(existing, source);
        } else if (strict) {
            throw conflictError(name, existing, source);
        } else {
            // Pre-ADR-059 apps keep working: the first definition wins, as
            // ModuleFactory would have picked it.
            log.warn('Two different definitions share one entity type name', {
                eventName: `${log.name}.duplicate_definition`,
                entityType: name,
                kept: existing.sources.map(describeSource).join(', '),
                ignored: describeSource(source),
            });
        }
        return undefined;
    }

    if (!infer) return name;
    registry.set(name, { definition, sources: [source], settings: {} });
    return undefined;
}

function assertAllRegistered(unregistered) {
    if (unregistered.size === 0) return;
    const detail = [...unregistered]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(
            ([name, sources]) => `${name} (bound by ${[...sources].join(', ')})`
        );
    throw new EntityRegistryError(
        `appDefinition.entities.${INFER_KEY} is false, so every module an integration binds must be registered. Missing: ${detail.join(
            '; '
        )}`
    );
}

const freezeEntries = (registry) => {
    for (const entry of registry.values()) {
        entry.sources.forEach(Object.freeze);
        Object.freeze(entry.sources);
        Object.freeze(entry.settings);
        Object.freeze(entry);
    }
};

/**
 * Builds the registry for an app definition.
 *
 * @param {object} [appDefinition] - `{ entities?, integrations? }`
 * @returns {Map<string, {definition: object, sources: Array<{kind: 'app'} | {kind: 'integration', name: string}>, settings: {scope?: string|object, proxy?: object, display?: object}}>}
 * @throws {EntityRegistryError} on a key/name mismatch, two different
 *   definitions under one name (when `entities` is present), or, with
 *   `$infer: false`, a bound module that is not registered.
 */
function getEntityTypeRegistry(appDefinition = {}) {
    const mode = readEntities(appDefinition);
    const registry = new Map();
    registerAppEntries(registry, mode.entries);

    const unregistered = new Map();
    for (const integrationClass of appDefinition?.integrations || []) {
        const source = integrationSource(integrationClass);
        for (const definition of boundDefinitions(integrationClass)) {
            const missing = mergeBoundDefinition(
                registry,
                definition,
                source,
                mode
            );
            if (missing !== undefined) {
                if (!unregistered.has(missing))
                    unregistered.set(missing, new Set());
                unregistered.get(missing).add(describeSource(source));
            }
        }
    }
    assertAllRegistered(unregistered);

    freezeEntries(registry);
    return registry;
}

/** The definitions of a registry, in registry order. */
const getEntityTypeDefinitions = (registry) =>
    [...registry.values()].map((entry) => entry.definition);

/** Names of the integrations that bind an entity type; empty for registry-only. */
const usedByOf = (entry) =>
    entry.sources.filter((s) => s.kind === 'integration').map((s) => s.name);

module.exports = {
    getEntityTypeRegistry,
    getEntityTypeDefinitions,
    usedByOf,
    entityTypeNameOf,
    EntityRegistryError,
};
