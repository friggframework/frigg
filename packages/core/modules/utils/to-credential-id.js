/**
 * Resolve the credential id from an entity's or module's `credential`, which
 * repositories return as the decrypted credential object (or a bare id).
 * @param {Object|string|number|null|undefined} credential
 * @returns {string|null}
 */
function toCredentialId(credential) {
    if (credential && typeof credential === 'object') {
        return credential.id?.toString() ?? null;
    }
    return credential?.toString() ?? null;
}

module.exports = { toCredentialId };
