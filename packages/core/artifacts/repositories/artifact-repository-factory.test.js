/**
 * Tests for createArtifactRepository (adapter selection by env/stage).
 */
const {
    createArtifactRepository,
    ArtifactRepositoryS3,
    ArtifactRepositoryLocal,
} = require('./artifact-repository-factory');

describe('createArtifactRepository', () => {
    const { REPORT_ARTIFACT_BUCKET, STAGE } = process.env;

    afterEach(() => {
        if (REPORT_ARTIFACT_BUCKET === undefined) {
            delete process.env.REPORT_ARTIFACT_BUCKET;
        } else {
            process.env.REPORT_ARTIFACT_BUCKET = REPORT_ARTIFACT_BUCKET;
        }
        if (STAGE === undefined) {
            delete process.env.STAGE;
        } else {
            process.env.STAGE = STAGE;
        }
    });

    it('returns the S3 adapter whenever a bucket is configured', () => {
        process.env.REPORT_ARTIFACT_BUCKET = 'my-bucket';
        process.env.STAGE = 'production';

        const repo = createArtifactRepository();

        expect(repo).toBeInstanceOf(ArtifactRepositoryS3);
        expect(repo.bucket).toBe('my-bucket');
    });

    it('returns the local adapter when no bucket is configured', () => {
        delete process.env.REPORT_ARTIFACT_BUCKET;
        process.env.STAGE = 'production';

        expect(createArtifactRepository()).toBeInstanceOf(
            ArtifactRepositoryLocal
        );
    });

    it('uses S3 on a deployed dev stage when the bucket is provisioned (no /tmp loss)', () => {
        // A deployed dev Lambda provisions the bucket; artifacts must be durable
        // there too — the executor writes and the router reads in different
        // containers, so ephemeral /tmp would silently lose them.
        process.env.REPORT_ARTIFACT_BUCKET = 'my-bucket';
        process.env.STAGE = 'dev';

        expect(createArtifactRepository()).toBeInstanceOf(ArtifactRepositoryS3);
    });

    it('falls back to local when no bucket, regardless of stage', () => {
        delete process.env.REPORT_ARTIFACT_BUCKET;
        process.env.STAGE = 'dev';

        expect(createArtifactRepository()).toBeInstanceOf(
            ArtifactRepositoryLocal
        );
    });
});
