/**
 * Shared validation for IntegrationRepository.patchIntegrationConfig().
 *
 * A patch is an atomic shallow merge into Integration.config: every key in
 * the patch is written, every other existing key is left untouched. This
 * contract is enforced here, before any adapter emits a query, so a bug fix
 * (or a tighter rule) fixes all three backends in one place.
 *
 * Keys may not contain '.' or start with '$' — both are reserved by the
 * MongoDB/DocumentDB update-command syntax the mongo and documentdb adapters
 * use to address `config.<key>` paths. A value of `null` is allowed and sets
 * the key to null — the only way to clear a config field over the PATCH HTTP
 * endpoint (it sets the value, it does not remove the key). `undefined` is
 * rejected: it can't arrive over JSON and signals a programming error, not an
 * intent. Removing a key entirely still requires a full replace via updateConfig.
 */
function validateConfigPatch(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new Error('patchIntegrationConfig: patch must be a non-null object');
    }

    const keys = Object.keys(patch);
    if (keys.length === 0) {
        throw new Error(
            'patchIntegrationConfig: patch must contain at least one key'
        );
    }

    for (const key of keys) {
        if (key.includes('.') || key.startsWith('$')) {
            throw new Error(
                `patchIntegrationConfig: patch key '${key}' cannot contain '.' or start with '$'`
            );
        }
        if (patch[key] === undefined) {
            throw new Error(
                `patchIntegrationConfig: patch['${key}'] cannot be undefined`
            );
        }
    }
}

module.exports = { validateConfigPatch };
