/**
 * Artifact Repository Interface
 *
 * Infrastructure Layer - Hexagonal Architecture
 *
 * Port for storing and retrieving report artifacts (non-JSON report output:
 * CSV, PDF, etc.). Implementations write the bytes to a durable store and hand
 * back a location reference; callers persist that reference on the execution
 * record and mint short-lived signed URLs on demand.
 */
class ArtifactRepositoryInterface {
    /**
     * Store an artifact.
     * @param {string} key - Storage key (caller-supplied, e.g.
     *   `reports/{executionId}/{name}-{stamp}.{ext}`).
     * @param {string|Buffer} body - Artifact bytes.
     * @param {string} contentType - MIME type.
     * @returns {Promise<{bucket: string, key: string}>} Location reference.
     */
    async put(key, body, contentType) {
        throw new Error('ArtifactRepositoryInterface.put not implemented');
    }

    /**
     * Mint a time-limited URL for reading a stored artifact.
     * @param {{bucket: string, key: string}|string} ref - Reference from put(),
     *   or a bare key.
     * @param {Object} [options]
     * @param {number} [options.expiresIn] - Seconds until the URL expires.
     * @returns {Promise<string>} URL.
     */
    async signedUrl(ref, { expiresIn } = {}) {
        throw new Error('ArtifactRepositoryInterface.signedUrl not implemented');
    }

    /**
     * Read a stored artifact's bytes.
     * @param {string} key - Storage key.
     * @returns {Promise<string>} Artifact body.
     */
    async get(key) {
        throw new Error('ArtifactRepositoryInterface.get not implemented');
    }
}

module.exports = { ArtifactRepositoryInterface };
