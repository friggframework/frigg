const Boom = require('@hapi/boom');

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
    return { entityType: credential.type, credentialId: String(credential.id) };
}

/** GET /api/v2/credentials/:credentialId/reauthorize */
class GetCredentialReauthorization {
    constructor({ getCredentialForUser, getAuthorizationStep }) {
        this.getCredentialForUser = getCredentialForUser;
        this.getAuthorizationStep = getAuthorizationStep;
    }

    async execute(credentialId, user, { step = 1, sessionId, state } = {}) {
        const binding = await credentialEntityType(
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
    constructor({ getCredentialForUser, submitAuthorizationStep }) {
        this.getCredentialForUser = getCredentialForUser;
        this.submitAuthorizationStep = submitAuthorizationStep;
    }

    async execute(credentialId, user, { data, step = 1, sessionId } = {}) {
        const binding = await credentialEntityType(
            this.getCredentialForUser,
            credentialId,
            user
        );
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
