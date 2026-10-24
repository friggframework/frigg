/**
 * Scope resolution and ownership on create (ADR-056 §3.1, §3.2, §3.6).
 *
 * No I/O: everything here is a function of what it is handed (settings, a
 * request's identity context, stored rows). This file also holds the shared
 * constants and `OwnershipConfigError`, so `scope-config.js` (which validates
 * app definitions) and `scope-visibility.js` can import them without a cycle.
 *
 * There is no `scope` column. The owner's user type already says it: no owner
 * is `global`, the active organization's user is `organization`, the caller's
 * individual user is `individual` (docs/guides/entity-scopes.md).
 */

const Boom = require('@hapi/boom');
const { BaseError } = require('../errors/base-error');
const { isPresent, sameId } = require('../user/membership');

const SCOPES = Object.freeze({
    INDIVIDUAL: 'individual',
    ORGANIZATION: 'organization',
    GLOBAL: 'global',
});
const SCOPE_VALUES = Object.freeze(Object.values(SCOPES));
const INDIVIDUAL_ACROSS_VALUES = Object.freeze(['organization', 'all']);
const OWNER_RULES = Object.freeze(['derive', 'individual', 'organization']);
const ACCESS = Object.freeze({ MANAGE: 'manage', USE: 'use', VIEW: 'view' });

/** Raised at app-definition load for an invalid ownership setting. */
class OwnershipConfigError extends BaseError {
    constructor(message, options) {
        super(message, options);
        this.code = 'OWNERSHIP_CONFIG_INVALID';
    }
}

const isPlainObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const configError = (where, message) =>
    new OwnershipConfigError(`${where}: ${message}`);

/**
 * One level's setting: a scope (`'organization'`) or a default plus what a
 * request may choose (`{ default, allow }`). Returns `{ default, allow }`, or
 * null when the level sets nothing. Idempotent on its own output.
 */
function parseScopeSetting(setting, where) {
    if (setting === undefined || setting === null) return null;
    if (typeof setting === 'string') {
        if (!SCOPE_VALUES.includes(setting)) {
            throw configError(
                where,
                `scope '${setting}' is not one of ${SCOPE_VALUES.join(', ')}`
            );
        }
        return { default: setting, allow: [setting] };
    }
    if (!isPlainObject(setting)) {
        throw configError(where, 'scope must be a scope name or { default, allow }');
    }
    const unknown = Object.keys(setting).filter(
        (key) => key !== 'default' && key !== 'allow'
    );
    if (unknown.length) {
        throw configError(where, `unknown scope setting(s): ${unknown.join(', ')}`);
    }
    const { allow, default: defaultScope } = setting;
    if (allow !== undefined) {
        if (
            !Array.isArray(allow) ||
            allow.length === 0 ||
            allow.some((value) => !SCOPE_VALUES.includes(value)) ||
            new Set(allow).size !== allow.length
        ) {
            throw configError(
                where,
                `scope.allow must list one or more of ${SCOPE_VALUES.join(', ')} once each`
            );
        }
    }
    if (defaultScope !== undefined && !SCOPE_VALUES.includes(defaultScope)) {
        throw configError(
            where,
            `scope.default '${defaultScope}' is not one of ${SCOPE_VALUES.join(', ')}`
        );
    }
    if (defaultScope === undefined && (allow === undefined || allow.length !== 1)) {
        throw configError(where, 'scope needs a default (or an allow list of exactly one)');
    }
    const resolvedDefault = defaultScope ?? allow[0];
    const resolvedAllow = allow ?? [resolvedDefault];
    if (!resolvedAllow.includes(resolvedDefault)) {
        throw configError(
            where,
            `scope.default '${resolvedDefault}' must be in scope.allow`
        );
    }
    return { default: resolvedDefault, allow: [...resolvedAllow] };
}

/** The level-6 default: `organization` for an organization-primary app. */
const defaultScopeFor = (primary) =>
    primary === 'organization' ? SCOPES.ORGANIZATION : SCOPES.INDIVIDUAL;

const LEVELS = ['binding', 'integration', 'entityType', 'app'];

/**
 * The first level that sets a scope (ADR-056 §3.1), each overriding those
 * below it; nothing intersects. Returns `{ default, allow, source }`.
 */
function decideLevel({ binding, integration, entityType, app, primary } = {}) {
    const settings = { binding, integration, entityType, app };
    for (const source of LEVELS) {
        const parsed = parseScopeSetting(settings[source], `${source} scope`);
        if (parsed) return { ...parsed, source };
    }
    const fallback = defaultScopeFor(primary);
    return { default: fallback, allow: [fallback], source: 'default' };
}

/**
 * What a request may choose, from the deciding level's `allow` list only. A
 * tenant request is never given `global`; a scope outside the list is refused.
 * Both are the same refusal (403 SCOPE_NOT_ALLOWED): the caller asked for
 * something this app does not offer.
 */
function applyRequest(decided, request) {
    const result = {
        scope: decided.default,
        source: decided.source,
        decidedBy: decided.source,
        allow: decided.allow,
    };
    if (request === undefined || request === null) return result;
    if (!SCOPE_VALUES.includes(request)) {
        throw Boom.badRequest(
            `scope must be one of ${SCOPE_VALUES.filter((s) => s !== SCOPES.GLOBAL).join(', ')}`,
            { code: 'SCOPE_INVALID', details: { field: 'scope' } }
        );
    }
    if (request === SCOPES.GLOBAL) {
        throw Boom.forbidden(
            'global entities are created by the app owner through admin routes, not by a tenant request',
            { code: 'SCOPE_NOT_ALLOWED' }
        );
    }
    if (!decided.allow.includes(request)) {
        throw Boom.forbidden(
            `scope '${request}' is not allowed here; allowed: ${decided.allow.join(', ')}`,
            {
                code: 'SCOPE_NOT_ALLOWED',
                details: { field: 'scope', allowed: decided.allow },
            }
        );
    }
    return { ...result, scope: request, source: 'request' };
}

/**
 * The scope a new connection gets: decideLevel then applyRequest.
 *
 * @param {Object} levels
 * @param {string} [levels.request] - `scope` on the request
 * @param {*} [levels.binding] - `use(module, { scope })` / `Definition.entities[key].scope`
 * @param {*} [levels.integration] - `Definition.ownership.scope`
 * @param {*} [levels.entityType] - registry `settings.scope` (ADR-059)
 * @param {*} [levels.app] - `appDefinition.ownership.scope`
 * @param {string} [levels.primary] - `user.primary`
 * @returns {{scope: string, source: string, decidedBy: string, allow: string[]}}
 */
function resolveScope({ request, ...levels } = {}) {
    return applyRequest(decideLevel(levels), request);
}

const MISSING_INDIVIDUAL =
    'this request has no individual user; send x-frigg-appuserid (or sign in with a token that names the person)';
const MISSING_ORGANIZATION =
    'this request has no active organization; send x-frigg-apporgid (or sign in with a token that names the organization)';

const missing = (message, field) =>
    Boom.badRequest(message, { code: 'IDENTITY_REQUIRED', details: { field } });

/**
 * The owner and organization for a new entity of `scope` (§3.2):
 *
 *   individual   -> the person; the active organization (null under 'all')
 *   organization -> the active organization's user, in that organization
 *   global       -> refused here: the tenant API never creates global entities
 *
 * `ctx` is an access context (scope-visibility.accessContext).
 */
function resolveOwnerForScope(scope, ctx) {
    if (scope === SCOPES.INDIVIDUAL) {
        if (!ctx.callerId) throw missing(MISSING_INDIVIDUAL, 'x-frigg-appuserid');
        return {
            scope,
            ownerId: ctx.callerId,
            organizationId: ctx.individualAcross === 'all' ? null : ctx.activeOrgId,
        };
    }
    if (scope === SCOPES.ORGANIZATION) {
        if (!ctx.activeOrgId) throw missing(MISSING_ORGANIZATION, 'x-frigg-apporgid');
        return { scope, ownerId: ctx.activeOrgId, organizationId: ctx.activeOrgId };
    }
    throw Boom.forbidden(
        'global entities are created by the app owner through admin routes, not through the tenant API',
        { code: 'SCOPE_NOT_ALLOWED' }
    );
}

/**
 * The owner kind of an integration (§3 "Integration ownership"): the
 * organization when every entity it uses is organization-scoped, otherwise the
 * person, unless `Definition.ownership.owner` says. ResolveIntegrationOwnership
 * then refuses an integration whose entities are not all of that one scope.
 */
function integrationOwnerKind(entityScopes, rule = 'derive') {
    if (rule === 'individual' || rule === 'organization') return rule;
    return entityScopes.length > 0 &&
        entityScopes.every((scope) => scope === SCOPES.ORGANIZATION)
        ? SCOPES.ORGANIZATION
        : SCOPES.INDIVIDUAL;
}

/**
 * The owner and organization of a new integration of owner kind `kind`
 * ('individual' | 'organization').
 */
function resolveIntegrationOwner(kind, ctx) {
    if (kind === SCOPES.ORGANIZATION) {
        if (!ctx.activeOrgId) throw missing(MISSING_ORGANIZATION, 'x-frigg-apporgid');
        return { ownerId: ctx.activeOrgId, organizationId: ctx.activeOrgId };
    }
    if (!ctx.callerId) throw missing(MISSING_INDIVIDUAL, 'x-frigg-appuserid');
    return { ownerId: ctx.callerId, organizationId: ctx.activeOrgId };
}

/**
 * The entity an authorization should reuse. The same provider account in two
 * organizations is two entities (§3.6), so an exact organization match wins.
 * A legacy row (organizationId null, written before scoping) is reused when
 * the visibility rule would show it here: an organization-owned one always
 * (the owner is unambiguous), an individual one only in the person's legacy
 * organization.
 */
function pickExistingEntity(candidates, { scope, organizationId, legacyOrgId }) {
    const rows = candidates || [];
    const unscoped = (row) => !isPresent(row.organizationId);
    const exact = rows.find((row) =>
        isPresent(organizationId)
            ? sameId(row.organizationId, organizationId)
            : unscoped(row)
    );
    if (exact) return exact;
    const legacyApplies =
        scope === SCOPES.ORGANIZATION || sameId(legacyOrgId, organizationId);
    return legacyApplies ? rows.find(unscoped) ?? null : null;
}

module.exports = {
    SCOPES,
    SCOPE_VALUES,
    INDIVIDUAL_ACROSS_VALUES,
    OWNER_RULES,
    ACCESS,
    OwnershipConfigError,
    configError,
    isPlainObject,
    parseScopeSetting,
    decideLevel,
    applyRequest,
    resolveScope,
    resolveOwnerForScope,
    integrationOwnerKind,
    resolveIntegrationOwner,
    pickExistingEntity,
};
