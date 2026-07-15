/**
 * Artifact Repository - Local Filesystem Storage
 *
 * Infrastructure Layer - Hexagonal Architecture
 *
 * Dev/test adapter: writes artifacts under a local directory and returns
 * file:// URLs. No network, no aws-sdk. Selected by the factory whenever S3 is
 * not configured (no REPORT_ARTIFACT_BUCKET) or the stage is local/dev/test.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
    ArtifactRepositoryInterface,
} = require('./artifact-repository-interface');

class ArtifactRepositoryLocal extends ArtifactRepositoryInterface {
    /**
     * @param {Object} [params]
     * @param {string} [params.baseDir] - Root directory for artifacts; defaults
     *   to process.env.REPORT_ARTIFACT_DIR or an OS temp subdirectory.
     */
    constructor({ baseDir } = {}) {
        super();
        this.baseDir =
            baseDir ||
            process.env.REPORT_ARTIFACT_DIR ||
            path.join(os.tmpdir(), 'frigg-report-artifacts');
    }

    _pathFor(key) {
        return path.join(this.baseDir, key);
    }

    async put(key, body, _contentType) {
        const filePath = this._pathFor(key);
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, body);
        return { bucket: this.baseDir, key };
    }

    async signedUrl(ref, _options = {}) {
        const key = ref?.key || ref;
        return `file://${this._pathFor(key)}`;
    }

    async get(key) {
        return fs.promises.readFile(this._pathFor(key), 'utf8');
    }
}

module.exports = { ArtifactRepositoryLocal };
