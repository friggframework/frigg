const { Credential } = require('../modules');

class CredentialRepository {
    async findCredentialById(id) {
        return Credential.findById(id);
    }

    async updateAuthenticationStatus(credentialId, authIsValid) {
        return Credential.updateOne({ _id: credentialId }, { $set: { auth_is_valid: authIsValid } });
    }

    /**
     * Permanently remove a credential document.
     * @param {string} credentialId
     * @returns {Promise<import('mongoose').DeleteResult>}
     */
    async deleteCredentialById(credentialId) {
        return Credential.deleteOne({ _id: credentialId });
    }

    /**
     * Create a new credential or update an existing one matching the identifiers.
     * `credentialDetails` format: { identifiers: { ... }, details: { ... } }
     * Identifiers are used in the query filter; details are merged into the document.
     * @param {{identifiers: Object, details: Object}} credentialDetails
     * @returns {Promise<Object>} The persisted credential (lean object)
     */
    async upsertCredential(credentialDetails) {
        const { identifiers, details } = credentialDetails;
        if (!identifiers) throw new Error('identifiers required to upsert credential');

        const query = { ...identifiers };

        const update = { $set: { ...details } };

        const options = {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
            lean: true,
            strict: false,
        };

        const credential = await Credential.findOneAndUpdate(query, update, options);
        return {
            id: credential._id.toString(),
            externalId: credential.externalId,
            userId: credential.user.toString(),
            auth_is_valid: credential.auth_is_valid,
            access_token: credential.access_token,
            refresh_token: credential.refresh_token,
        }
    }
}

module.exports = { CredentialRepository };
