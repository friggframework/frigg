/**
 * Dev/test artifact adapter: writes to a local directory and returns file:// URLs.
 * Selected by the factory only when no object store is configured (no REPORT_ARTIFACT_BUCKET).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
    ArtifactRepositoryInterface,
} = require('./artifact-repository-interface');

class ArtifactRepositoryLocal extends ArtifactRepositoryInterface {
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
