/**
 * Artifact Repository Factory
 *
 * Selects the storage adapter by whether a durable object store is configured:
 * S3 whenever REPORT_ARTIFACT_BUCKET is set — the infra provisions that bucket
 * for every deployed stage with a non-JSON report, INCLUDING dev — and the
 * local filesystem adapter only when no bucket is configured (local dev / tests).
 *
 * This deliberately does NOT mirror the encryption stage-bypass. Skipping
 * encryption in dev still yields working data, but routing a deployed dev
 * Lambda's artifacts to ephemeral /tmp would silently lose them: the executor
 * writes and the router reads in different containers, and /tmp does not
 * survive. A configured bucket therefore always wins.
 */
const { ArtifactRepositoryS3 } = require('./artifact-repository-s3');
const { ArtifactRepositoryLocal } = require('./artifact-repository-local');

function createArtifactRepository() {
    const bucket = process.env.REPORT_ARTIFACT_BUCKET;
    if (bucket) {
        return new ArtifactRepositoryS3({ bucket });
    }
    return new ArtifactRepositoryLocal();
}

module.exports = {
    createArtifactRepository,
    ArtifactRepositoryS3,
    ArtifactRepositoryLocal,
};
