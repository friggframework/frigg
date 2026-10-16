/**
 * Reading and validating ownership settings in an app definition (ADR-056
 * §3.1, §3.3). Called once by loadAppDefinition, so a bad setting stops the app
 * at load, not on the first request. No I/O.
 */

const {
    SCOPES,
    INDIVIDUAL_ACROSS_VALUES,
    OWNER_RULES,
    DEFAULT_ORG_ADMIN_ROLES,
    configError,
    isPlainObject,
    parseScopeSetting,
    resolveScope,
} = require('./scope-resolution');
const { entityTypeNameOf } = require('./entity-type-registry');

/** The binding scope an integration declares for `modules[key]`, if any. */
function bindingScopeSetting(Definition, key) {
    const binding = Definition?.modules?.[key];
    if (binding?.scope !== undefined) return binding.scope;
    const entityEntry = Definition?.entities?.[key];
    if (entityEntry?.scope !== undefined) return entityEntry.scope;
    // Deprecated alias from the global-entities branch: `global: true`.
    if (entityEntry?.global === true) return SCOPES.GLOBAL;
    return undefined;
}

function readAppOwnership(appDefinition) {
    const raw = appDefinition?.ownership;
    if (raw === undefined || raw === null) {
        return { scope: null, individualAcross: 'organization' };
    }
    if (!isPlainObject(raw)) {
        throw configError('appDefinition.ownership', 'must be an object');
    }
    const unknown = Object.keys(raw).filter(
        (key) => key !== 'scope' && key !== 'individualAcross'
    );
    if (unknown.length) {
        throw configError(
            'appDefinition.ownership',
            `unknown setting(s): ${unknown.join(', ')}`
        );
    }
    const individualAcross = raw.individualAcross ?? 'organization';
    if (!INDIVIDUAL_ACROSS_VALUES.includes(individualAcross)) {
        throw configError(
            'appDefinition.ownership.individualAcross',
            `must be one of ${INDIVIDUAL_ACROSS_VALUES.join(', ')}`
        );
    }
    return {
        scope: parseScopeSetting(raw.scope, 'appDefinition.ownership.scope'),
        individualAcross,
    };
}

function readIntegrationOwnership(integrationClass) {
    const name = integrationClass?.Definition?.name || 'unnamed';
    const raw = integrationClass?.Definition?.ownership;
    if (raw === undefined || raw === null) return { scope: null, owner: 'derive' };
    const where = `integration '${name}' ownership`;
    if (!isPlainObject(raw)) throw configError(where, 'must be an object');
    const unknown = Object.keys(raw).filter(
        (key) => key !== 'scope' && key !== 'owner'
    );
    if (unknown.length) {
        throw configError(where, `unknown setting(s): ${unknown.join(', ')}`);
    }
    const owner = raw.owner ?? 'derive';
    if (!OWNER_RULES.includes(owner)) {
        throw configError(where, `owner must be one of ${OWNER_RULES.join(', ')}`);
    }
    return { scope: parseScopeSetting(raw.scope, `${where}.scope`), owner };
}

/**
 * `user.orgAdminRoles`: the token roles that may manage organization-level
 * things. Default `['ADMIN']`. A shared-secret caller needs no role.
 */
function readOrgAdminRoles(appDefinition) {
    const raw = appDefinition?.user?.orgAdminRoles;
    if (raw === undefined || raw === null) return [...DEFAULT_ORG_ADMIN_ROLES];
    if (
        !Array.isArray(raw) ||
        raw.length === 0 ||
        raw.some((role) => typeof role !== 'string' || role.trim() === '')
    ) {
        throw configError(
            'appDefinition.user.orgAdminRoles',
            'must be a non-empty array of role names'
        );
    }
    return [...raw];
}

/**
 * Every binding of every integration with its resolved scope and where it came
 * from, parsing each integration's settings once. Throws OwnershipConfigError
 * for any invalid one. Exported for tooling that wants to show the chain.
 */
function listBindingScopes(appDefinition, entityTypeRegistry, primary) {
    const app = readAppOwnership(appDefinition);
    const rows = [];
    for (const integrationClass of appDefinition?.integrations || []) {
        const Definition = integrationClass?.Definition;
        const name = Definition?.name || 'unnamed';
        const ownership = readIntegrationOwnership(integrationClass);
        for (const [key, binding] of Object.entries(Definition?.modules || {})) {
            const moduleName = entityTypeNameOf(binding?.definition);
            const resolved = resolveScope({
                binding: parseScopeSetting(
                    bindingScopeSetting(Definition, key),
                    `integration '${name}' binding '${key}' scope`
                ),
                integration: ownership.scope,
                entityType: moduleName
                    ? entityTypeRegistry?.get(moduleName)?.settings?.scope
                    : undefined,
                app: app.scope,
                primary,
            });
            rows.push({
                integration: name,
                binding: key,
                moduleName: moduleName ?? null,
                scope: resolved.scope,
                source: resolved.source,
                owner: ownership.owner,
            });
        }
    }
    return rows;
}

/**
 * Validates every ownership setting in one pass and returns the app-level
 * config the runtime needs.
 *
 * @returns {{scope: ({default: string, allow: string[]}|null), individualAcross: string, orgAdminRoles: string[]}}
 * @throws {OwnershipConfigError}
 */
function resolveOwnershipConfig(appDefinition, entityTypeRegistry) {
    const app = readAppOwnership(appDefinition);
    for (const [name, entry] of entityTypeRegistry || []) {
        parseScopeSetting(entry?.settings?.scope, `entity type '${name}' scope`);
    }
    const rows = listBindingScopes(
        appDefinition,
        entityTypeRegistry,
        appDefinition?.user?.primary
    );
    // §3.3: a shared integration must not run on one person's credential.
    for (const row of rows) {
        if (row.owner === 'organization' && row.scope === SCOPES.INDIVIDUAL) {
            throw configError(
                `integration '${row.integration}' binding '${row.binding}'`,
                "an organization-owned integration cannot bind an 'individual' entity"
            );
        }
    }
    return Object.freeze({
        scope: app.scope,
        individualAcross: app.individualAcross,
        orgAdminRoles: Object.freeze(readOrgAdminRoles(appDefinition)),
    });
}

module.exports = {
    bindingScopeSetting,
    readAppOwnership,
    readIntegrationOwnership,
    listBindingScopes,
    resolveOwnershipConfig,
};
