/**
 * The object a use case asks about scopes (ADR-056 §3): the app's ownership
 * config and entity type registry bound once, as closures. With no arguments it
 * is the behaviour of an app that configures nothing.
 */

const {
    INDIVIDUAL_ACROSS_VALUES,
    DEFAULT_ORG_ADMIN_ROLES,
    configError,
    parseScopeSetting,
    resolveScope,
    resolveOwnerForScope,
} = require('./scope-resolution');
const {
    accessContext,
    accessToOwner,
    describeRecord,
} = require('./scope-visibility');

/**
 * @param {Object} [params]
 * @param {{scope: *, individualAcross: string, orgAdminRoles?: string[]}} [params.ownership] - the raw
 *   `appDefinition.ownership` or what resolveOwnershipConfig returned (a parsed
 *   `{ default, allow }` parses to itself)
 * @param {Map} [params.entityTypeRegistry]
 */
function createScopePolicy({ ownership, entityTypeRegistry } = {}) {
    const appScope = parseScopeSetting(
        ownership?.scope,
        'appDefinition.ownership.scope'
    );
    const individualAcross = ownership?.individualAcross ?? 'organization';
    if (!INDIVIDUAL_ACROSS_VALUES.includes(individualAcross)) {
        throw configError(
            'appDefinition.ownership.individualAcross',
            `must be one of ${INDIVIDUAL_ACROSS_VALUES.join(', ')}`
        );
    }

    const orgAdminRoles = ownership?.orgAdminRoles ?? DEFAULT_ORG_ADMIN_ROLES;

    const contextFor = (user) =>
        accessContext(user, { individualAcross, orgAdminRoles });

    /** The scope a new connection of `entityType` gets (levels 1, 4, 5, 6). */
    const resolveEntityScope = ({ entityType, requestScope, binding, integration, user }) =>
        resolveScope({
            request: requestScope,
            binding,
            integration,
            entityType: entityTypeRegistry?.get?.(entityType)?.settings?.scope,
            app: appScope,
            primary: user?.config?.primary,
        });

    /**
     * Scope, then owner and organization, for a new entity. `legacyOrgId` (the
     * person's legacy organization pointer) rides along so a later lookup can
     * reuse an entity written before scoping.
     */
    const resolveOwnership = ({ entityType, requestScope, user }) => {
        const ctx = contextFor(user);
        const resolved = resolveEntityScope({ entityType, requestScope, user });
        return {
            ...resolveOwnerForScope(resolved.scope, ctx),
            legacyOrgId: ctx.legacyOrgId,
            source: resolved.source,
        };
    };

    /** Whether `user` may load this stored entity for use (same clauses as the list). */
    const canUseEntity = (user, entity) =>
        describeRecord(entity, contextFor(user), 'entity') !== null;

    /**
     * What `user` may do with a record owned by `ownerId` that has no
     * organization of its own (a credential): manage, or null when not theirs.
     */
    const accessToOwnedBy = (user, ownerId) => accessToOwner(ownerId, contextFor(user));

    return Object.freeze({
        individualAcross,
        orgAdminRoles,
        accessToOwnedBy,
        accessContext: contextFor,
        resolveScope: resolveEntityScope,
        resolveOwnership,
        canUseEntity,
    });
}

/** The policy of an app that configures nothing; what a use case gets by default. */
const DEFAULT_SCOPE_POLICY = createScopePolicy();

module.exports = { createScopePolicy, DEFAULT_SCOPE_POLICY };
