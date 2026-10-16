/**
 * Which stored rows a caller may see and use (ADR-056 §3.4, §3.6).
 *
 * No I/O. One clause list (`ctx.clauses`) is what a repository is asked for and
 * what `describeRecord` checks every returned row against, so a list and an
 * access check cannot drift apart. The clauses are built once per request, when
 * the access context is.
 */

const { isPresent, idString, sameId } = require('../user/membership');
const { SCOPES, ACCESS } = require('./scope-resolution');

/**
 * One owner/organization pair a repository ORs into a single query.
 * `userId` is the owner's user id, and for an organization-owned row that is
 * the ORGANIZATION user's id, not a person's. `organizationId: null` means "has
 * no organization" (unset or null); otherwise the id of the organization.
 *
 * @typedef {Object} OwnershipClause
 * @property {string} userId
 * @property {(string|null)} organizationId
 */

/**
 * Whether the caller's own rows with no organization belong to the context this
 * request acts in: always when it acts in no organization (today's behaviour),
 * always for an entity under `individualAcross: 'all'`, and otherwise only in
 * the person's legacy organization.
 */
function unscopedRowsBelongHere(base, kind) {
    return (
        !base.activeOrgId ||
        (kind === 'entity' && base.individualAcross === 'all') ||
        sameId(base.legacyOrgId, base.activeOrgId)
    );
}

/**
 * What a caller may see, as owner/organization pairs:
 *
 *   - the active organization's own rows (owner = the organization), whether
 *     they carry its id or, written before scoping, none;
 *   - the caller's rows in the active organization;
 *   - the caller's rows with no organization, when `unscopedRowsBelongHere`.
 *
 * `kind` is 'entity' or 'integration'; only entities may be
 * organization-independent under 'all' (an integration always belongs to the
 * organization it was created in).
 *
 * @returns {OwnershipClause[]}
 */
function buildClauses(base, kind) {
    const clauses = [];
    if (base.activeOrgId) {
        clauses.push({ userId: base.activeOrgId, organizationId: base.activeOrgId });
        clauses.push({ userId: base.activeOrgId, organizationId: null });
    }
    if (base.callerId) {
        if (base.activeOrgId) {
            clauses.push({ userId: base.callerId, organizationId: base.activeOrgId });
        }
        if (unscopedRowsBelongHere(base, kind)) {
            clauses.push({ userId: base.callerId, organizationId: null });
        }
    }
    return clauses;
}

/**
 * Who the caller is, for ownership and visibility: their individual user, the
 * organization this request acts in, the legacy `organizationId` pointer, and
 * the clauses that follow from them (computed once).
 *
 * @param {Object} user - the authenticated `User` (or a `{ getId }` double)
 * @param {{individualAcross?: string}} [options]
 */
function accessContext(user, { individualAcross = 'organization' } = {}) {
    const hasUserModel = typeof user?.getIndividualUser === 'function';
    const individual = hasUserModel ? user.getIndividualUser() : null;
    const base = {
        callerId: hasUserModel ? idString(individual?.id) : idString(user?.getId?.()),
        activeOrgId:
            typeof user?.getActiveOrganizationId === 'function'
                ? idString(user.getActiveOrganizationId())
                : null,
        legacyOrgId: idString(individual?.organizationId),
        individualAcross,
    };
    return {
        ...base,
        clauses: {
            entity: buildClauses(base, 'entity'),
            integration: buildClauses(base, 'integration'),
        },
    };
}

/** The clauses for `kind` ('entity' | 'integration'): what to ask the repository. */
const visibilityClauses = (ctx, kind) => ctx.clauses[kind];

const matchesClause = (record, clause) =>
    sameId(record.userId, clause.userId) &&
    (clause.organizationId === null
        ? !isPresent(record.organizationId)
        : sameId(record.organizationId, clause.organizationId));

/** The scope a stored row has for this caller, from its owner. */
function scopeOf(record, ctx) {
    if (!isPresent(record?.userId)) return SCOPES.GLOBAL;
    if (sameId(record.userId, ctx.activeOrgId)) return SCOPES.ORGANIZATION;
    if (sameId(record.userId, ctx.callerId)) return SCOPES.INDIVIDUAL;
    return null;
}

const accessFor = (scope) =>
    scope === SCOPES.GLOBAL ? ACCESS.USE : ACCESS.MANAGE;

/**
 * What a row is to this caller, or null when they may not see it.
 * `{ scope, owner: {type, id}, organizationId, access }` (§3.4). A `global`
 * row is never described: it is not the tenant's to see.
 */
function describeRecord(record, ctx, kind) {
    if (!record) return null;
    const scope = scopeOf(record, ctx);
    if (scope === null || scope === SCOPES.GLOBAL) return null;
    if (!ctx.clauses[kind].some((clause) => matchesClause(record, clause))) {
        return null;
    }
    return {
        scope,
        owner: { type: scope, id: idString(record.userId) },
        organizationId:
            scope === SCOPES.ORGANIZATION
                ? idString(record.userId)
                : idString(record.organizationId),
        access: accessFor(scope),
    };
}

/** `?owner=` values and the scope each one means. */
const LIST_OWNERS = Object.freeze({
    me: SCOPES.INDIVIDUAL,
    org: SCOPES.ORGANIZATION,
});

/** Whether a described row passes `?scope=` and `?owner=`. */
function matchesListFilters(description, { scope, owner } = {}) {
    if (scope !== undefined && description.scope !== scope) return false;
    if (owner !== undefined && description.owner.type !== LIST_OWNERS[owner]) {
        return false;
    }
    return true;
}

module.exports = {
    accessContext,
    unscopedRowsBelongHere,
    visibilityClauses,
    matchesClause,
    scopeOf,
    describeRecord,
    LIST_OWNERS,
    matchesListFilters,
};
