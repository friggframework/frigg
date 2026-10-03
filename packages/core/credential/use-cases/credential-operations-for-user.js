const Boom = require('@hapi/boom');
const { userOwns } = require('../../modules/use-cases/get-entity-module-for-user');

/**
 * Management API v2 credential operations. A credential has no module name
 * of its own; its `type` and the entities that use it come from the
 * caller's entities. A missing or foreign credential is a 404.
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

/** The caller's credentials with their type and entity usage. */
class ListCredentialsForUser {
    constructor({ credentialRepository, moduleRepository }) {
        this.credentialRepository = credentialRepository;
        this.moduleRepository = moduleRepository;
    }

    async execute(user) {
        const userId = user.getId();
        const [credentials, entities] = await Promise.all([
            this.credentialRepository.findCredentialsByUserId(userId),
            this.moduleRepository.findEntitiesByUserId(userId),
        ]);
        return withEntityUsage(credentials || [], entities);
    }
}

/** One credential the caller owns, with its type and entity usage. */
class GetCredentialForUserV2 {
    constructor({ credentialRepository, moduleRepository }) {
        this.credentialRepository = credentialRepository;
        this.moduleRepository = moduleRepository;
    }

    async execute(credentialId, user) {
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
        if (!credential || !userOwns(user, credential.userId)) {
            throw Boom.notFound(`Credential ${credentialId} not found`, {
                code: 'CREDENTIAL_NOT_FOUND',
            });
        }
        const entities = await this.moduleRepository.findEntitiesByUserId(
            credential.userId
        );
        return withEntityUsage([credential], entities)[0];
    }
}

/**
 * Deletes a credential the caller owns. The entities that used it stay, with
 * their credential unset, so they show as needing re-authorization rather
 * than disappearing from integrations.
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
