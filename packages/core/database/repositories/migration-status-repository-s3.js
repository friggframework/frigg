/**
 * Migration Status Repository - S3 Storage
 *
 * Infrastructure Layer - Hexagonal Architecture
 *
 * Stores migration status in S3 to avoid chicken-and-egg dependency on User/Process tables.
 * Initial database migrations can't use Process table (requires User FK which doesn't exist yet).
 */

const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { randomUUID } = require('crypto');

class MigrationStatusRepositoryS3 {
    /**
     * @param {string} bucketName - S3 bucket name for migration status storage
     * @param {S3Client} s3Client - Optional S3 client (for testing)
     */
    constructor(bucketName, s3Client = null) {
        this.bucketName = bucketName;
        this.s3Client =
            s3Client ||
            new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    }

    /**
     * Build S3 key for migration status
     * @param {string} migrationId - Migration identifier
     * @param {string} stage - Deployment stage
     * @returns {string} S3 key
     */
    _buildS3Key(migrationId, stage) {
        return `migrations/${stage}/${migrationId}.json`;
    }

    /**
     * Create new migration status record
     * @param {Object} data - Migration data
     * @param {string} [data.migrationId] - Migration ID (generates UUID if not provided)
     * @param {string} data.stage - Deployment stage
     * @param {string} [data.triggeredBy] - User or system that triggered migration
     * @param {string} [data.triggeredAt] - ISO timestamp
     * @returns {Promise<Object>} Created migration status
     */
    async create(data) {
        const migrationId = data.migrationId || randomUUID();
        const timestamp = data.triggeredAt || new Date().toISOString();

        const status = {
            migrationId,
            stage: data.stage,
            state: 'INITIALIZING',
            progress: 0,
            triggeredBy: data.triggeredBy || 'system',
            triggeredAt: timestamp,
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        const key = this._buildS3Key(migrationId, data.stage);

        await this.s3Client.send(
            new PutObjectCommand({
                Bucket: this.bucketName,
                Key: key,
                Body: JSON.stringify(status, null, 2),
                ContentType: 'application/json',
            })
        );

        return status;
    }

    /**
     * Update existing migration status
     * @param {Object} data - Update data
     * @param {string} data.migrationId - Migration ID
     * @param {string} data.stage - Deployment stage
     * @param {string} [data.state] - New state
     * @param {number} [data.progress] - Progress percentage (0-100)
     * @param {string} [data.error] - Error message if failed
     * @param {string} [data.completedAt] - Completion timestamp
     * @returns {Promise<Object>} Updated migration status
     */
    async update(data) {
        const key = this._buildS3Key(data.migrationId, data.stage);

        // Get existing status
        const existing = await this.get(data.migrationId, data.stage);

        // Merge updates
        const updated = {
            ...existing,
            ...data,
            updatedAt: new Date().toISOString(),
        };

        await this.s3Client.send(
            new PutObjectCommand({
                Bucket: this.bucketName,
                Key: key,
                Body: JSON.stringify(updated, null, 2),
                ContentType: 'application/json',
            })
        );

        return updated;
    }

    /**
     * Get migration status by ID
     * @param {string} migrationId - Migration ID
     * @param {string} stage - Deployment stage
     * @returns {Promise<Object>} Migration status
     * @throws {Error} If migration not found
     */
    async get(migrationId, stage) {
        const key = this._buildS3Key(migrationId, stage);

        try {
            const response = await this.s3Client.send(
                new GetObjectCommand({
                    Bucket: this.bucketName,
                    Key: key,
                })
            );

            const body = await response.Body.transformToString();
            return JSON.parse(body);
        } catch (error) {
            if (error.name === 'NoSuchKey') {
                throw new Error(`Migration not found: ${migrationId}`);
            }
            throw error;
        }
    }
}

module.exports = { MigrationStatusRepositoryS3 };
