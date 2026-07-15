const UNKNOWN_TYPE = 'unknown';

/**
 * Tally active credentials by integration type.
 *
 * The Credential model carries no integration-type column, so the type is
 * derived from the related Entity.moduleName — a non-secret, bounded dimension.
 * Each credential is counted once per DISTINCT linked moduleName; a credential
 * with no linked module falls under `unknown`. Operates purely on the
 * non-encrypted projection its callers pass in — never on `data`/secrets.
 *
 * @param {Array<{ entities?: Array<{ moduleName?: string|null }> }>} credentials
 * @returns {Array<{ integrationType: string, count: number }>}
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
