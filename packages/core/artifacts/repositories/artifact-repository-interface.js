/**
 * Port for report artifacts (non-JSON output like CSV, PDF). Implementations
 * write bytes to a durable store and return a location reference the caller
 * persists; signed URLs are minted on read.
 */
class ArtifactRepositoryInterface {
    /**
     * @param {string} key - Caller-supplied, e.g. `reports/{executionId}/{name}-{stamp}.{ext}`.
     * @returns {Promise<{bucket: string, key: string}>} Location reference.
     */
    async put(key, body, contentType) {
        throw new Error('ArtifactRepositoryInterface.put not implemented');
    }

    /**
     * @param {{bucket: string, key: string}|string} ref - Reference from put(), or a bare key.
     */
    async signedUrl(ref, { expiresIn } = {}) {
        throw new Error('ArtifactRepositoryInterface.signedUrl not implemented');
    }

    async get(key) {
        throw new Error('ArtifactRepositoryInterface.get not implemented');
    }
}

module.exports = { ArtifactRepositoryInterface };
