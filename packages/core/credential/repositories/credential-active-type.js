const UNKNOWN_TYPE = 'unknown';

/**
 * Type is derived from the related Entity.moduleName since Credential carries
 * no type column. Counted once per distinct linked moduleName; none → `unknown`.
 * Reads only the non-encrypted projection — never `data`/secrets.
 */
function tallyActiveCredentialsByType(credentials = []) {
    const counts = new Map();

    for (const credential of credentials) {
        const modules = new Set(
            (credential?.entities || [])
                .map((entity) => entity?.moduleName)
                .filter(
                    (moduleName) => moduleName != null && moduleName !== ''
                )
        );
        const types = modules.size > 0 ? [...modules] : [UNKNOWN_TYPE];

        for (const type of types) {
            counts.set(type, (counts.get(type) || 0) + 1);
        }
    }

    return [...counts].map(([integrationType, count]) => ({
        integrationType,
        count,
    }));
}

module.exports = { tallyActiveCredentialsByType, UNKNOWN_TYPE };
