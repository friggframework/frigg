import { randomUUID } from 'node:crypto';

// Use require to avoid needing @aws-sdk/client-s3 type declarations at compile time
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { S3Client: S3ClientClass, PutObjectCommand: PutObjectCmd, GetObjectCommand: GetObjectCmd } = require('@aws-sdk/client-s3');

// Minimal type definitions for AWS SDK S3 client
interface S3ClientLike {
    send(command: unknown): Promise<{ Body?: { transformToString(): Promise<string> } }>;
}


export interface MigrationStatus {
    migrationId: string;
    stage: string;
    state: string;
    progress: number;
    triggeredBy: string;
    triggeredAt: string;
    createdAt: string;
    updatedAt: string;
    error?: string;
    completedAt?: string;
}

export interface CreateMigrationStatusData {
    migrationId?: string;
    stage: string;
    triggeredBy?: string;
    triggeredAt?: string;
}

export interface UpdateMigrationStatusData {
    migrationId: string;
    stage: string;
    state?: string;
    progress?: number;
    error?: string;
    completedAt?: string;
}

export class MigrationStatusRepositoryS3 {
    private readonly bucketName: string;
    private readonly s3Client: S3ClientLike;

    constructor(bucketName: string, s3Client: S3ClientLike | null = null) {
        this.bucketName = bucketName;
        this.s3Client = s3Client || new S3ClientClass({ region: process.env.AWS_REGION || 'us-east-1' });
    }

    private _buildS3Key(migrationId: string, stage: string): string {
        return `migrations/${stage}/${migrationId}.json`;
    }

    async create(data: CreateMigrationStatusData): Promise<MigrationStatus> {
        const migrationId = data.migrationId || randomUUID();
        const timestamp = data.triggeredAt || new Date().toISOString();

        const status: MigrationStatus = {
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
            new PutObjectCmd({
                Bucket: this.bucketName,
                Key: key,
                Body: JSON.stringify(status, null, 2),
                ContentType: 'application/json',
            })
        );

        return status;
    }

    async update(data: UpdateMigrationStatusData): Promise<MigrationStatus> {
        const key = this._buildS3Key(data.migrationId, data.stage);

        const existing = await this.get(data.migrationId, data.stage);

        const updated: MigrationStatus = {
            ...existing,
            ...data,
            updatedAt: new Date().toISOString(),
        };

        await this.s3Client.send(
            new PutObjectCmd({
                Bucket: this.bucketName,
                Key: key,
                Body: JSON.stringify(updated, null, 2),
                ContentType: 'application/json',
            })
        );

        return updated;
    }

    async get(migrationId: string, stage: string): Promise<MigrationStatus> {
        const key = this._buildS3Key(migrationId, stage);

        try {
            const response = await this.s3Client.send(
                new GetObjectCmd({
                    Bucket: this.bucketName,
                    Key: key,
                })
            );

            const body = await response.Body!.transformToString();
            return JSON.parse(body);
        } catch (error: unknown) {
            if ((error as { name?: string }).name === 'NoSuchKey') {
                throw new Error(`Migration not found: ${migrationId}`);
            }
            throw error;
        }
    }
}
