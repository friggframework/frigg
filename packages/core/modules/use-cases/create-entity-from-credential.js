const Boom = require('@hapi/boom');
const { Module } = require('../module');

const sameId = (a, b) =>
    a !== undefined && a !== null && b !== undefined && b !== null &&
    String(a) === String(b);

/**
 * Creates (or finds) the entity for a credential the caller already holds:
 * the v1 `POST /api/entity`. The owner and organization follow the scope of
 * `entityType`, exactly as an authorization does (ADR-056 §3.2, §3.6), so the
 * owner is decided by `AuthorizeEntityForUser.resolveOwnership` and never by
 * `user.getId()`. Whatever that resolution refuses (a missing identity, and
 * an organization-level connection by a non-admin) is refused here too.
 *
 * The credential must belong to that owner: an organization entity is built
 * on the organization's credential, an individual one on the person's own.
 */
class CreateEntityFromCredential {
    /**
     * @param {Object} params
     * @param {import('./authorize-entity-for-user').AuthorizeEntityForUser} params.authorizeEntityForUser
     * @param {import('./process-authorization-callback').ProcessAuthorizationCallback} params.processAuthorizationCallback
     * @param {Object} params.credentialRepository
     * @param {Array<Object>} params.moduleDefinitions
     * @param {Function} [params.createModule] - builds a Module; injectable for tests
     */
    constructor({
        authorizeEntityForUser,
        processAuthorizationCallback,
        credentialRepository,
        moduleDefinitions,
        createModule,
    }) {
        this.authorizeEntityForUser = authorizeEntityForUser;
        this.processAuthorizationCallback = processAuthorizationCallback;
        this.credentialRepository = credentialRepository;
        this.moduleDefinitions = moduleDefinitions || [];
        this.createModule = createModule || ((params) => new Module(params));
    }

    /**
     * @param {Object} params
     * @param {Object} params.user - authenticated User
     * @param {string} params.entityType
     * @param {string} params.credentialId
     * @returns {Promise<Object>} the persisted entity
     */
    async execute({ user, entityType, credentialId }) {
        const definition = this.moduleDefinitions.find(
            (def) =>
                def.moduleName === entityType ||
                (typeof def.getName === 'function' && def.getName() === entityType)
        );
        if (!definition) {
            throw Boom.badRequest(`Unknown entity type ${entityType}`, {
                code: 'ENTITY_TYPE_NOT_FOUND',
            });
        }

        const ownership = this.authorizeEntityForUser.resolveOwnership({
            user,
            entityType,
        });

        const credential =
            await this.credentialRepository.findCredentialById(credentialId);
        // A missing credential and someone else's are the same answer, so ids
        // cannot be probed.
        if (!credential || !sameId(credential.userId, ownership.ownerId)) {
            throw Boom.badRequest('Invalid credential ID', {
                code: 'INVALID_CREDENTIAL',
            });
        }

        // Built for the owner, with the credential loaded (the repository
        // returns its tokens flat; a Module reads them from `data`), so the
        // API can call the provider and a token refresh during
        // getEntityDetails updates the owner's credential.
        const { id, userId, externalId, authIsValid, ...data } = credential;
        const module = this.createModule({
            userId: ownership.ownerId,
            definition,
            entity: {
                credential: { id, userId, externalId, authIsValid, data },
            },
        });
        const entityDetails =
            await definition.requiredAuthMethods.getEntityDetails(
                module.api,
                null,
                null,
                ownership.ownerId
            );
        Object.assign(
            entityDetails.details,
            module.apiParamsFromEntity(module.api)
        );

        return this.processAuthorizationCallback.findOrCreateEntity(
            entityDetails,
            definition.moduleName,
            credential.id,
            {
                scope: ownership.scope,
                organizationId: ownership.organizationId,
                legacyOrgId: ownership.legacyOrgId,
            }
        );
    }
}

module.exports = { CreateEntityFromCredential };
