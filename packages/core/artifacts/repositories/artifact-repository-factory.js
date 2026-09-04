// A configured bucket always wins, even in dev (unlike the encryption stage-bypass):
// a deployed Lambda writes artifacts and the router reads them in different containers,
// so routing dev to ephemeral /tmp would silently lose them.
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
