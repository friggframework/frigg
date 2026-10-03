const {
    MANAGEMENT_API_VERSIONS,
    PREFERRED_API_VERSION,
    listV2Routes,
} = require('../route-registry');

/**
 * Builds the GET /api/meta document (ADR-053 §4): the API majors this
 * deployment serves, their status and OpenAPI links, and the capability flags
 * clients feature-detect with. Reads configuration only: no database, no
 * network.
 */
class GetManagementApiMeta {
    /**
     * @param {Object} params
     * @param {ReturnType<import('../management-api-config').resolveManagementApiConfig>} params.config
     * @param {string} params.coreVersion - @friggframework/core version, admin-only.
     */
    constructor({ config, coreVersion }) {
        this.config = config;
        this.coreVersion = coreVersion;
    }

    /**
     * @param {Object} [options]
     * @param {boolean} [options.isAdmin=false] - caller presented the admin key.
     */
    execute({ isAdmin = false } = {}) {
        const versions = {};
        for (const [major, info] of Object.entries(MANAGEMENT_API_VERSIONS)) {
            const disabled = major === '1' && !this.config.v1;
            versions[major] = {
                ...info,
                ...(disabled && { status: 'disabled' }),
                openapi: `/api/meta/openapi/v${major}.json`,
            };
        }

        // Capabilities come from the routes the app actually serves, so a flag
        // can never advertise a route that is not mounted.
        const capabilities = [
            ...new Set(
                listV2Routes({ proxy: this.config.proxy.enable })
                    .map((r) => r.capability)
                    .filter(Boolean)
            ),
        ].sort();

        return {
            api: { versions, preferred: PREFERRED_API_VERSION },
            capabilities,
            ...(isAdmin && { frigg: { coreVersion: this.coreVersion } }),
        };
    }
}

module.exports = { GetManagementApiMeta };
