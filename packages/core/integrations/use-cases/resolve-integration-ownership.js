const Boom = require('@hapi/boom');
const { SCOPES, resolveScope } = require('../../modules/scope-resolution');
const {
    integrationOwnerKind,
    resolveIntegrationOwner,
} = require('../../modules/scope-resolution');
const {
    describeRecord,
    unscopedRowsBelongHere,
} = require('../../modules/scope-visibility');
const {
    bindingScopeSetting,
    readIntegrationOwnership,
} = require('../../modules/scope-config');
const { DEFAULT_SCOPE_POLICY } = require('../../modules/scope-policy');
const { entityTypeNameOf } = require('../../modules/entity-type-registry');

const notFound = (entityId) =>
    Boom.notFound(`Entity ${entityId} not found`, { code: 'ENTITY_NOT_FOUND' });

/**
 * Who owns an integration about to be created, and in which organization
 * (ADR-056 §3, §3.3, §3.6). Shared by the v1 and v2 create paths. Nothing is
 * persisted before this has answered, so a refusal leaves no row behind.
 *
 * Every entity must be one the caller may use in the active organization. A
 * missing one, another organization's and a `global` one are the same 404, so
 * ids cannot be probed. When the integration declares a scope (a binding's
 * `scope` or `Definition.entities[key].scope`, or `Definition.ownership.scope`)
 * the entity's scope must be in it. Levels below the integration (entity type,
 * app, default) decide where a connection is CREATED and do not restrict what
 * an integration may bind, so an app that adds a registry scope later does not
 * break integrations that already use older connections.
 *
 * The owner follows the entities (all organization: the organization;
 * otherwise the person) unless `Definition.ownership.owner` says. Every entity
 * must then be of the owner's own scope: an integration is loaded by its owner,
 * who must own what it uses, so an integration that mixes an organization
 * entity with a person's own, or that names an owner that does not match, is
 * refused with a 400 here, before anything is written.
 */
class ResolveIntegrationOwnership {
    /**
     * @param {Object} params
     * @param {import('../../modules/repositories/module-repository-interface').ModuleRepositoryInterface} params.moduleRepository
     * @param {Array<Function>} params.integrationClasses
     * @param {Object} [params.scopePolicy] - from createScopePolicy
     */
    constructor({ moduleRepository, integrationClasses, scopePolicy }) {
        this.moduleRepository = moduleRepository;
        this.integrationClasses = integrationClasses || [];
        this.scopePolicy = scopePolicy || DEFAULT_SCOPE_POLICY;
    }

    /**
     * @param {Object} params
     * @param {Array<string|number>} params.entityIds
     * @param {Object} params.config - `{ type }`
     * @param {Object} params.user - authenticated User
     * @returns {Promise<{ownerId: string, organizationId: (string|null), ownerKind: string, adoptUnscoped: boolean}>}
     */
    async execute({ entityIds, config, user }) {
        const ctx = this.scopePolicy.accessContext(user);
        const integrationClass = this.integrationClasses.find(
            (IntegrationClass) => IntegrationClass.Definition?.name === config?.type
        );
        const ownership = readIntegrationOwnership(integrationClass);

        const entities = await this.loadEntities(entityIds);
        const scoped = entities.map((entity) => ({
            entity,
            scope: this.acceptedScope({ entity, ctx, integrationClass, ownership }),
        }));

        const ownerKind = integrationOwnerKind(
            scoped.map(({ scope }) => scope),
            ownership.owner
        );
        this.assertOneScope(scoped, ownerKind, config?.type);
        return {
            ...resolveIntegrationOwner(ownerKind, ctx),
            ownerKind,
            // Whether an existing integration with no organization (written
            // before scoping) is this caller's to reuse. An organization-owned
            // one is unambiguous: its owner is the organization, whoever asks
            // and whatever their own legacy pointer says. A person's is theirs
            // only where scope-visibility says (their legacy organization).
            adoptUnscoped:
                ownerKind === SCOPES.ORGANIZATION ||
                unscopedRowsBelongHere(ctx, 'integration'),
        };
    }

    /** Every entity must be of the integration owner's own scope (see the class comment). */
    assertOneScope(scoped, ownerKind, type) {
        for (const { entity, scope } of scoped) {
            if (scope === ownerKind) continue;
            // The load-time check (resolveOwnershipConfig) only sees declared
            // scopes; this one sees the entities actually named.
            if (ownerKind === SCOPES.ORGANIZATION) {
                throw Boom.badRequest(
                    "An organization-owned integration cannot use an 'individual' entity: a shared integration must not run on one person's credential",
                    {
                        code: 'ORG_INTEGRATION_INDIVIDUAL_ENTITY',
                        details: { entityId: String(entity.id) },
                    }
                );
            }
            throw Boom.badRequest(
                `Integration '${type}' would be owned by the person but uses the organization entity ${entity.id}. An integration must use entities of one scope: all of the person's, or all of the organization's.`,
                {
                    code: 'MIXED_ENTITY_SCOPES',
                    details: { entityId: String(entity.id), scope },
                }
            );
        }
    }

    async loadEntities(entityIds) {
        const ids = (entityIds || []).map(String);
        if (ids.length === 0) return [];
        let found;
        try {
            found = await this.moduleRepository.findEntitiesByIds(ids);
        } catch (error) {
            // A malformed id (e.g. not an integer on PostgreSQL) is "not found".
            if (/Invalid ID|ObjectId|Malformed/i.test(error?.message || '')) {
                throw notFound(ids[0]);
            }
            throw error;
        }
        const byId = new Map((found || []).filter(Boolean).map((e) => [String(e.id), e]));
        return ids.map((id) => {
            if (!byId.has(id)) throw notFound(id);
            return byId.get(id);
        });
    }

    /** The entity's scope for this caller, or a refusal. */
    acceptedScope({ entity, ctx, integrationClass, ownership }) {
        const described = describeRecord(entity, ctx, 'entity');
        if (!described) throw notFound(entity.id);
        const { scope } = described;

        const declared = this.declaredScope({ entity, integrationClass, ownership });
        if (declared && !declared.allow.includes(scope)) {
            throw Boom.badRequest(
                `Entity ${entity.id} is ${scope}-scoped, but this integration binds ${entity.moduleName} at ${declared.allow.join(' or ')} scope`,
                {
                    code: 'ENTITY_SCOPE_MISMATCH',
                    details: { entityId: String(entity.id), scope, allowed: declared.allow },
                }
            );
        }
        return scope;
    }

    /**
     * What the integration itself declares for this entity's binding (levels 2
     * and 3 only), or null when it declares nothing.
     */
    declaredScope({ entity, integrationClass, ownership }) {
        const Definition = integrationClass?.Definition;
        const key = Object.keys(Definition?.modules || {}).find(
            (candidate) =>
                entityTypeNameOf(Definition.modules[candidate]?.definition) ===
                entity.moduleName
        );
        const resolved = resolveScope({
            binding: key === undefined ? undefined : bindingScopeSetting(Definition, key),
            integration: ownership.scope,
        });
        return resolved.decidedBy === 'default' ? null : resolved;
    }
}

module.exports = { ResolveIntegrationOwnership };
