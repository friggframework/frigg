/**
 * Which stored rows a caller may see and use (ADR-056 §3.4, §3.6).
 *
 * No I/O. One clause list (`ctx.clauses`) is what a repository is asked for and
 * what `describeRecord` checks every returned row against, so a list and an
 * access check cannot drift apart. The clauses are built once per request, when
 * the access context is.
 */

const { isPresent, idString, sameId } = require('../user/membership');
const { AUTH_SOURCES } = require('../user/user');
const { SCOPES, ACCESS, DEFAULT_ORG_ADMIN_ROLES } = require('./scope-resolution');

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
 * Whether the caller may manage organization-level things (create, change,
 * delete), ADR-056 §3.6:
 *
 * - A shared-secret caller is the app's own backend and may.
 * - A Frigg bearer token (`/user/login`) predates organization roles and
 *   carries none. It keeps its pre-roles behaviour and may, unless the app
 *   sets `user.orgAdminGateBearerTokens: true`; then it is judged like any
 *   other caller below.
 * - Otherwise the role is the one the token carries; when it carries none,
 *   the role stored on the caller's membership of the active organization;
 *   when there is none, `MEMBER`. A missing role never means admin. An
 *   unknown source (a `User` built outside AuthenticateUser) is judged this
 *   way too.
 *
 * @param {{authSource: (string|null), orgRole: (string|null), membershipRole: (string|null)}} who
 * @param {string[]} adminRoles - `user.orgAdminRoles`, compared case-insensitively
 * @param {{gateBearerTokens?: boolean}} [options]
 */
function canManageOrganization(
    { authSource, orgRole, membershipRole },
    adminRoles = DEFAULT_ORG_ADMIN_ROLES,
    { gateBearerTokens = false } = {}
) {
    if (authSource === AUTH_SOURCES.SHARED_SECRET) return true;
    if (authSource === AUTH_SOURCES.BEARER_TOKEN && !gateBearerTokens) return true;
    let role = 'MEMBER';
    if (isPresent(orgRole)) role = orgRole;
    else if (isPresent(membershipRole)) role = membershipRole;
    role = String(role).toUpperCase();
    return adminRoles.some((admin) => String(admin).toUpperCase() === role);
}

/**
 * Who the caller is, for ownership and visibility: their individual user, the
 * organization this request acts in, the legacy `organizationId` pointer,
 * whether they may manage organization-level things, and the clauses that
 * follow from them (computed once).
 *
 * @param {Object} user - the authenticated `User` (or a `{ getId }` double)
 * @param {{individualAcross?: string, orgAdminRoles?: string[], gateBearerTokens?: boolean}} [options]
 */
function accessContext(
    user,
    {
        individualAcross = 'organization',
        orgAdminRoles = DEFAULT_ORG_ADMIN_ROLES,
        gateBearerTokens = false,
    } = {}
) {
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
    const who = {
        authSource:
            typeof user?.getAuthSource === 'function' ? user.getAuthSource() : null,
        orgRole: typeof user?.getOrgRole === 'function' ? user.getOrgRole() : null,
        membershipRole:
            typeof user?.getMembershipRole === 'function'
                ? user.getMembershipRole()
                : null,
    };
    return {
        ...base,
        canManageOrg: canManageOrganization(who, orgAdminRoles, {
            gateBearerTokens,
        }),
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

/** manage for the person's own; for the organization's, only an admin; use otherwise. */
const accessFor = (scope, ctx) => {
    if (scope === SCOPES.INDIVIDUAL) return ACCESS.MANAGE;
    if (scope === SCOPES.ORGANIZATION) {
        return ctx.canManageOrg ? ACCESS.MANAGE : ACCESS.USE;
    }
    return ACCESS.USE;
};

/**
 * What the caller may do with a record owned by `ownerId` that carries no
 * organization of its own (a credential): manage the person's own, manage the
 * active organization's only as an admin, nothing otherwise. Null when the
 * record is not theirs.
 */
function accessToOwner(ownerId, ctx) {
    const scope = scopeOf({ userId: ownerId }, ctx);
    if (scope !== SCOPES.INDIVIDUAL && scope !== SCOPES.ORGANIZATION) return null;
    return accessFor(scope, ctx);
}

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
        access: accessFor(scope, ctx),
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
    canManageOrganization,
    accessToOwner,
    accessContext,
    unscopedRowsBelongHere,
    visibilityClauses,
    matchesClause,
    scopeOf,
    describeRecord,
    LIST_OWNERS,
    matchesListFilters,
};
