const Boom = require('@hapi/boom');
const { Module } = require('../module');

const sameId = (a, b) =>
    a !== undefined &&
    a !== null &&
    b !== undefined &&
    b !== null &&
    String(a) === String(b);

/**
 * Creates (or finds) the entity for a credential the caller already holds:
 * the v1 `POST /api/entity`.
 *
 * The module is built with the stored credential loaded, so the API can call
 * the provider and a token refresh during `getEntityDetails` updates that
 * credential. Persistence reuses `ProcessAuthorizationCallback.findOrCreateEntity`,
 * the same find-or-create (and credential repointing) the authorization flow
 * uses, so the two paths cannot drift.
 */
class CreateEntityFromCredential {
    /**
     * @param {Object} params
     * @param {import('./process-authorization-callback').ProcessAuthorizationCallback} params.processAuthorizationCallback
     * @param {Object} params.credentialRepository
     * @param {Array<Object>} params.moduleDefinitions
     * @param {Function} [params.createModule] - builds a Module; injectable for tests
     */
    constructor({
        processAuthorizationCallback,
        credentialRepository,
        moduleDefinitions,
        createModule,
    }) {
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
        const userId = user?.getId?.();
        if (userId === undefined || userId === null) {
            throw Boom.unauthorized('No authenticated user');
        }

        const definition = this.moduleDefinitions.find(
            (def) => def && def.moduleName === entityType
        );
        if (!definition) {
            throw Boom.badRequest(`Unknown entity type ${entityType}`, {
                code: 'ENTITY_TYPE_NOT_FOUND',
            });
        }

        const credential =
            await this.credentialRepository.findCredentialById(credentialId);
        // A missing credential and someone else's get the same answer, so
        // credential ids cannot be probed.
        if (!credential || !sameId(credential.userId, userId)) {
            throw Boom.badRequest('Invalid credential ID', {
                code: 'INVALID_CREDENTIAL',
            });
        }

        // The repository returns the tokens flat; a Module reads them from
        // `credential.data`.
        const { id, userId: ownerId, externalId, authIsValid, ...data } =
            credential;
        const module = this.createModule({
            userId,
            definition,
            entity: {
                credential: { id, userId: ownerId, externalId, authIsValid, data },
            },
        });

        const entityDetails =
            await definition.requiredAuthMethods.getEntityDetails(
                module.api,
                null,
                null,
                userId
            );
        Object.assign(
            entityDetails.details,
            module.apiParamsFromEntity(module.api)
        );

        return this.processAuthorizationCallback.findOrCreateEntity(
            entityDetails,
            definition.moduleName,
            credential.id
        );
    }
}

module.exports = { CreateEntityFromCredential };
