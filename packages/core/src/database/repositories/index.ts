export { HealthCheckRepositoryInterface } from './health-check-repository-interface';
export type { DatabaseConnectionState, CredentialData } from './health-check-repository-interface';
export { HealthCheckRepositoryMongoDB } from './health-check-repository-mongodb';
export { HealthCheckRepositoryPostgreSQL } from './health-check-repository-postgres';
export { HealthCheckRepositoryDocumentDB } from './health-check-repository-documentdb';
export { createHealthCheckRepository } from './health-check-repository-factory';
// MigrationStatusRepositoryS3 requires @aws-sdk/client-s3 which is optional.
// Export only as type to avoid loading the SDK at module init time.
export type { MigrationStatusRepositoryS3 } from './migration-status-repository-s3';
export type { MigrationStatus, CreateMigrationStatusData, UpdateMigrationStatusData } from './migration-status-repository-s3';
