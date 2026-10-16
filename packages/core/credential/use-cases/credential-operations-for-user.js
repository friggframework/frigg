const Boom = require('@hapi/boom');
const {
    createScopePolicy,
    describeRecord,
    visibilityClauses,
    matchesListFilters,
    SCOPES,
} = require('../../modules/entity-scope');
const { assertCanManage } = require('../../modules/use-cases/manage-access');

/**
 * Management API v2 credential operations (ADR-056 §3.4, §3.6). A credential
 * has no module name and no organization of its own:
 *
 * - its `type` and `entityIds` come from the entities that use it that the
 *   caller may see, so the same person's account connected in two
 *   organizations (one credential, two entities) lists in each organization
 *   with that organization's entity only;
 * - who it belongs to is its OWNER (`credential.userId`), never the entities:
 *   a credential an individual entity and an organization entity both point at
 *   (possible only through legacy data) is described by whoever owns the
 *   credential, so the answer cannot change with the order the entities load;
 * - a credential whose entities are all out of sight (another organization's)
 *   is a 404, and one with no entities at all (its entity was deleted) is
 *   visible to its owner only, as it was before scoping.
 */

const credentialIdOf = (entity) => {
    const ref = entity.credential ?? entity.credentialId;
    if (ref === undefined || ref === null) return null;
    if (typeof ref === 'object') {
        const id = ref.id ?? ref._id;
        return id === undefined || id === null ? null : String(id);
    }
    return String(ref);
};

/** Adds `type` and `entityIds` from the user's entities to each credential. */
function withEntityUsage(credentials, entities) {
    const usage = new Map();
    for (const entity of entities || []) {
        const credentialId = credentialIdOf(entity);
        if (!credentialId) continue;
        const entry = usage.get(credentialId) || { type: null, entityIds: [] };
        entry.type = entry.type || entity.moduleName || null;
        entry.entityIds.push(String(entity.id));
        usage.set(credentialId, entry);
    }
    return credentials.map((credential) => {
        const entry = usage.get(String(credential.id)) || {
            type: null,
            entityIds: [],
        };
        return { ...credential, type: entry.type, entityIds: entry.entityIds };
    });
}

/**
 * `{scope, owner, organizationId, access}` of a credential for this caller, or
 * null when its owner is neither the caller nor the active organization. Built
 * by `describeRecord` over the row a connection by this owner has: the
 * organization of a visible entity, else the one a new entity would get.
 */
function credentialTenancy(credential, visibleEntities, ctx) {
    const entityOrg = visibleEntities.find(
        (entity) => entity.organizationId !== undefined && entity.organizationId !== null
    )?.organizationId;
    const organizationId =
        entityOrg ?? (ctx.individualAcross === 'all' ? null : ctx.activeOrgId);
    return describeRecord({ userId: credential.userId, organizationId }, ctx, 'entity');
}

/** The entities of `entities` the caller may see, each with its `tenancy`. */
function visibleOf(entities, ctx) {
    const visible = [];
    for (const entity of entities || []) {
        const tenancy = describeRecord(entity, ctx, 'entity');
        if (tenancy) visible.push({ ...entity, tenancy });
    }
    return visible;
}

/**
 * The caller's credentials with their type, the entities of them they may see
 * and `tenancy`. Credentials with no entity at all are listed too, for the
 * person and the active organization that own them.
 */
class ListCredentialsForUser {
    constructor({ credentialRepository, moduleRepository, scopePolicy }) {
        this.credentialRepository = credentialRepository;
        this.moduleRepository = moduleRepository;
        this.scopePolicy = scopePolicy || createScopePolicy();
    }

    /** @param {{scope?: string, owner?: string}} [filters] */
    async execute(user, filters = {}) {
        const ctx = this.scopePolicy.accessContext(user);
        const owners = [...new Set([ctx.callerId, ctx.activeOrgId].filter(Boolean))];
        const [found, perOwner, owned] = await Promise.all([
            this.moduleRepository.findEntitiesByOwnership(visibilityClauses(ctx, 'entity')),
            Promise.all(owners.map((id) => this.credentialRepository.findCredentialsByUserId(id))),
            // Every entity of those owners, in any organization: only to tell a credential
            // with no entity at all from one used elsewhere.
            Promise.all(owners.map((id) => this.moduleRepository.findEntitiesByUserId(id))),
        ]);
        const visible = visibleOf(found, ctx);
        const usedAnywhere = new Set(owned.flat().map(credentialIdOf).filter(Boolean));
        const listed = [];
        for (const credential of perOwner.flat().filter(Boolean)) {
            const id = String(credential.id);
            const referencing = visible.filter((entity) => credentialIdOf(entity) === id);
            if (referencing.length === 0 && usedAnywhere.has(id)) continue;
            const tenancy = credentialTenancy(credential, referencing, ctx);
            if (!tenancy || !matchesListFilters(tenancy, filters)) continue;
            listed.push({ ...withEntityUsage([credential], referencing)[0], tenancy });
        }
        return listed;
    }
}

/** One credential the caller may see: see the header. 404 otherwise. */
class GetCredentialForUserV2 {
    constructor({ credentialRepository, moduleRepository, scopePolicy }) {
        this.credentialRepository = credentialRepository;
        this.moduleRepository = moduleRepository;
        this.scopePolicy = scopePolicy || createScopePolicy();
    }

    async execute(credentialId, user) {
        const notFound = () =>
            Boom.notFound(`Credential ${credentialId} not found`, {
                code: 'CREDENTIAL_NOT_FOUND',
            });
        let credential = null;
        try {
            credential = await this.credentialRepository.findCredentialById(
                credentialId
            );
        } catch (error) {
            if (!/Invalid ID|ObjectId|Malformed/i.test(error?.message || '')) {
                throw error;
            }
        }
        if (!credential) throw notFound();
        const ctx = this.scopePolicy.accessContext(user);

        const referencing =
            (await this.moduleRepository.findEntities({ credentialId: credential.id })) || [];
        const visible = visibleOf(referencing, ctx);
        if (referencing.length > 0 && visible.length === 0) throw notFound();
        const tenancy = credentialTenancy(credential, visible, ctx);
        if (!tenancy) throw notFound();
        return { ...withEntityUsage([credential], visible)[0], tenancy };
    }
}

/**
 * Deletes a credential the caller may manage. The entities that used it stay,
 * with their credential unset, so they show as needing re-authorization rather
 * than disappearing from integrations.
 *
 * Refuses with 409 `CREDENTIAL_SHARED` while an entity the caller cannot see
 * still uses it: one credential row serves the same provider account in every
 * organization, and deleting it from one would break the other. The message
 * says nothing about the other connections (not even how many): remove the
 * entities that use it, and it goes with the last one.
 */
class DeleteCredentialForUser {
    constructor({ credentialRepository, moduleRepository, getCredentialForUser }) {
        this.credentialRepository = credentialRepository;
        this.moduleRepository = moduleRepository;
        this.getCredentialForUser = getCredentialForUser;
    }

    async execute(credentialId, user) {
        const credential = await this.getCredentialForUser.execute(
            credentialId,
            user
        );
        assertCanManage(credential.tenancy.access, `credential ${credential.id}`);
        const usedBy =
            (await this.moduleRepository.findEntities({ credentialId: credential.id })) || [];
        if (usedBy.length > credential.entityIds.length) {
            throw Boom.conflict(
                `Credential ${credential.id} is still in use by other connections and cannot be deleted from here`,
                { code: 'CREDENTIAL_SHARED' }
            );
        }
        for (const entityId of credential.entityIds) {
            await this.moduleRepository.unsetCredential(entityId);
        }
        await this.credentialRepository.deleteCredentialById(credential.id);
        return { id: String(credential.id), entityIds: credential.entityIds };
    }
}

module.exports = {
    ListCredentialsForUser,
    GetCredentialForUserV2,
    DeleteCredentialForUser,
    withEntityUsage,
};
