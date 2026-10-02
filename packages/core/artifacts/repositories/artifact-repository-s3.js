// aws-sdk modules are lazy-required so importing this file (and the factory that
// references it) never forces the SDK to load for contexts that only need the local adapter.
const {
    ArtifactRepositoryInterface,
} = require('./artifact-repository-interface');

class ArtifactRepositoryS3 extends ArtifactRepositoryInterface {
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
        // No ACL set: the bucket blocks public access, so objects stay private.
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
