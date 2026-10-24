const Boom = require('@hapi/boom');
const { DEFAULT_SCOPE_POLICY } = require('../../modules/scope-policy');
const { assertCanManage } = require('../../modules/use-cases/manage-access');

/**
 * Re-authorization of a credential the caller owns (Management API v2). It
 * runs the same flow as /api/v2/authorize for the credential's entity type,
 * with the session bound to the credential so it cannot be reused for
 * anything else.
 */
async function credentialEntityType(getCredentialForUser, credentialId, user) {
    const credential = await getCredentialForUser.execute(credentialId, user);
    if (!credential.type) {
        throw Boom.conflict(
            `Credential ${credentialId} is not used by any entity, so its type is unknown; authorize a new connection instead`,
            { code: 'CREDENTIAL_TYPE_UNKNOWN' }
        );
    }
    return {
        entityType: credential.type,
        credentialId: String(credential.id),
        ownerId: credential.userId,
    };
}

/** GET /api/v2/credentials/:credentialId/reauthorize */
class GetCredentialReauthorization {
    constructor({ getCredentialForUser, getAuthorizationStep }) {
        this.getCredentialForUser = getCredentialForUser;
        this.getAuthorizationStep = getAuthorizationStep;
    }

    async execute(credentialId, user, { step = 1, sessionId, state } = {}) {
        const { ownerId, ...binding } = await credentialEntityType(
            this.getCredentialForUser,
            credentialId,
            user
        );
        return this.getAuthorizationStep.execute({
            user,
            ...binding,
            step,
            sessionId,
            state,
        });
    }
}

/** POST /api/v2/credentials/:credentialId/reauthorize */
class ReauthorizeCredentialForUser {
    constructor({ getCredentialForUser, submitAuthorizationStep, scopePolicy }) {
        this.scopePolicy = scopePolicy || DEFAULT_SCOPE_POLICY;
        this.getCredentialForUser = getCredentialForUser;
        this.submitAuthorizationStep = submitAuthorizationStep;
    }

    async execute(credentialId, user, { data, step = 1, sessionId } = {}) {
        const { ownerId, ...binding } = await credentialEntityType(
            this.getCredentialForUser,
            credentialId,
            user
        );
        // A credential an organization owns: the organization's admins only.
        const access = this.scopePolicy.accessToOwnedBy(user, ownerId);
        if (access !== null) assertCanManage(access, `credential ${credentialId}`);
        return this.submitAuthorizationStep.execute({
            user,
            ...binding,
            data,
            step,
            sessionId,
        });
    }
}

module.exports = { GetCredentialReauthorization, ReauthorizeCredentialForUser };
