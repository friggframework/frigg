const { maskCredential } = require('../dto');

/** Management API v2 credential handlers, keyed by operationId. */
function createCredentialHandlers(useCases) {
    const { listCredentialsForUser, getCredentialForUser, deleteCredentialForUser } =
        useCases;

    return {
        async listCredentials(_req, res, user) {
            const credentials = await listCredentialsForUser.execute(user);
            res.json({ credentials: credentials.map(maskCredential) });
        },

        async getCredential(req, res, user) {
            res.json(
                maskCredential(
                    await getCredentialForUser.execute(req.params.credentialId, user)
                )
            );
        },

        async deleteCredential(req, res, user) {
            await deleteCredentialForUser.execute(req.params.credentialId, user);
            res.status(204).end();
        },
    };
}

module.exports = { createCredentialHandlers };
