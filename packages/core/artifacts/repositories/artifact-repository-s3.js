/**
 * Artifact Repository - S3 Storage
 *
 * Infrastructure Layer - Hexagonal Architecture
 *
 * Stores report artifacts as private, server-side-encrypted S3 objects and
 * mints short-lived presigned GET URLs for reads. The aws-sdk modules are
 * lazy-required (like MigrationStatusRepositoryS3) so importing this file — and
 * the factory that references it — never forces the SDK to load in contexts
 * that only need the local adapter.
 */
const {
    ArtifactRepositoryInterface,
} = require('./artifact-repository-interface');

class ArtifactRepositoryS3 extends ArtifactRepositoryInterface {
    /**
     * @param {Object} [params]
     * @param {string} [params.bucket] - Target bucket; defaults to
     *   process.env.REPORT_ARTIFACT_BUCKET.
     * @param {string} [params.region] - AWS region; defaults to
     *   process.env.AWS_REGION.
     * @param {Object} [params.s3Client] - Pre-built S3 client (for testing).
     */
    constructor({ bucket, region, s3Client } = {}) {
        super();
        this.bucket = bucket || process.env.REPORT_ARTIFACT_BUCKET;
        this.region = region || process.env.AWS_REGION || 'us-east-1';
        this._s3Client = s3Client || null;
    }

    _getClient() {
        if (!this._s3Client) {
            const { S3Client } = require('@aws-sdk/client-s3');
            this._s3Client = new S3Client({ region: this.region });
        }
        return this._s3Client;
    }

    async put(key, body, contentType) {
        if (!this.bucket) {
            throw new Error(
                'REPORT_ARTIFACT_BUCKET is not configured; cannot store report artifact'
            );
        }
        const { PutObjectCommand } = require('@aws-sdk/client-s3');
        // No ACL (bucket blocks public access); SSE-S3 encrypts at rest.
        await this._getClient().send(
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: body,
                ContentType: contentType,
                ServerSideEncryption: 'AES256',
            })
        );
        return { bucket: this.bucket, key };
    }

    async signedUrl(ref, { expiresIn = 3600 } = {}) {
        const { GetObjectCommand } = require('@aws-sdk/client-s3');
        const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
        const bucket = ref?.bucket || this.bucket;
        const key = ref?.key || ref;
        const command = new GetObjectCommand({ Bucket: bucket, Key: key });
        return getSignedUrl(this._getClient(), command, { expiresIn });
    }

    async get(key) {
        const { GetObjectCommand } = require('@aws-sdk/client-s3');
        const response = await this._getClient().send(
            new GetObjectCommand({ Bucket: this.bucket, Key: key })
        );
        return response.Body.transformToString();
    }
}

module.exports = { ArtifactRepositoryS3 };
