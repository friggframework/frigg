/**
 * Authorizes an entity for a caller: decides who will own it and in which
 * organization (ADR-056 §3.2, §3.6), then runs the module's authorization.
 * Shared by the v1 `POST /api/authorize` and the v2 authorize flow, so the
 * owner is decided in one place and never by `user.primary`.
 */
class AuthorizeEntityForUser {
    /**
     * @param {Object} params
     * @param {Object} params.scopePolicy - from createScopePolicy
     * @param {import('./process-authorization-callback').ProcessAuthorizationCallback} params.processAuthorizationCallback
     */
    constructor({ scopePolicy, processAuthorizationCallback }) {
        this.scopePolicy = scopePolicy;
        this.processAuthorizationCallback = processAuthorizationCallback;
    }

    /**
     * The scope, owner and organization a new entity of `entityType` gets for
     * this caller. Throws a 400/403 when the request cannot have one.
     *
     * @param {{user: Object, entityType: string, scope?: string, fixedScope?: string}} params
     *   `fixedScope`: a re-authorization keeps the scope its connection has
     */
    resolveOwnership({ user, entityType, scope, fixedScope }) {
        if (fixedScope) return this.scopePolicy.ownershipForScope({ scope: fixedScope, user });
        return this.scopePolicy.resolveOwnership({
            entityType,
            requestScope: scope,
            user,
        });
    }

    /**
     * @param {Object} params
     * @param {Object} params.user - authenticated User
     * @param {string} params.entityType
     * @param {Object} params.data - what the module's authorization needs
     * @param {string} [params.scope] - the scope the request asks for
     * @param {Object} [params.ownership] - from `resolveOwnership`, when the
     *   caller needed it earlier (a multi-step flow does)
     * @returns {Promise<{result: Object, ownership: Object}>} the callback's
     *   `{ credential_id, entity_id, type }` and the ownership it ran with
     */
    async execute({ user, entityType, data, scope, ownership }) {
        const resolved = ownership ?? this.resolveOwnership({ user, entityType, scope });
        const result = await this.processAuthorizationCallback.execute(
            resolved.ownerId,
            entityType,
            data,
            {
                scope: resolved.scope,
                organizationId: resolved.organizationId,
                legacyOrgId: resolved.legacyOrgId,
            }
        );
        return { result, ownership: resolved };
    }
}

module.exports = { AuthorizeEntityForUser };
