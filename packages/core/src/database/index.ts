// Database configuration
export { default as config } from './config';
export { getDatabaseType, getDbType } from './config';
export type { DatabaseType } from './config';

// Prisma client
export {
    prisma,
    connectPrisma,
    disconnectPrisma,
    getEncryptionConfig,
    ensureMongoDbUrl,
} from './prisma';
export type { PrismaClientLike, EncryptionConfig } from './prisma';

// Encryption
export {
    logger,
    EncryptionLogger,
    CORE_ENCRYPTION_SCHEMA,
    getEncryptedFields,
    hasEncryptedFields,
    getEncryptedModels,
    registerCustomSchema,
    loadCustomEncryptionSchema,
    loadModuleEncryptionSchemas,
    extractCredentialFieldsFromModules,
    validateCustomSchema,
    resetCustomSchema,
    FieldEncryptionService,
    createEncryptionExtension,
} from './encryption';
export type {
    EncryptionModelConfig,
    EncryptionSchema,
    ValidationResult,
    ModuleDefinition,
    IntegrationClass,
    EncryptionSchemaProvider,
} from './encryption';

// Repositories
export {
    HealthCheckRepositoryInterface,
    HealthCheckRepositoryMongoDB,
    HealthCheckRepositoryPostgreSQL,
    HealthCheckRepositoryDocumentDB,
    createHealthCheckRepository,
    MigrationStatusRepositoryS3,
} from './repositories';
export type {
    DatabaseConnectionState,
    CredentialData,
} from './repositories';
export type {
    MigrationStatus,
    CreateMigrationStatusData,
    UpdateMigrationStatusData,
} from './repositories';

// Use Cases
export {
    CheckDatabaseHealthUseCase,
    CheckDatabaseStateUseCase,
    CheckEncryptionHealthUseCase,
    TestEncryptionUseCase,
    GetDatabaseStateViaWorkerUseCase,
    GetMigrationStatusUseCase,
    RunDatabaseMigrationUseCase,
    TriggerDatabaseMigrationUseCase,
    MigrationError,
    NotFoundError,
    CheckDatabaseStateValidationError,
    GetMigrationStatusValidationError,
    RunMigrationValidationError,
    TriggerMigrationValidationError,
} from './use-cases';
export type {
    DatabaseHealthResult,
    PrismaRunner,
    DatabaseStateResult,
    EncryptionHealthResult,
    EncryptionTestResult,
    MigrationResult,
    TriggerMigrationResult,
} from './use-cases';

// Adapters
export { LambdaInvoker, LambdaInvocationError } from './adapters';

// Utils
export {
    ensureCollectionExists,
    ensureCollectionsExist,
    collectionExists,
    initializeMongoDBSchema,
    getPrismaCollections,
    getPrismaSchemaPath,
    runPrismaGenerate,
    checkDatabaseState,
    runPrismaMigrate,
    runPrismaMigrateResolve,
    runPrismaDbPush,
    getMigrationCommand,
    parseCollectionsFromSchema,
    parseCollectionsFromSchemaSync,
    extractCollectionNames,
    findMongoDBSchemaFile,
    getCollectionsFromSchema,
    getCollectionsFromSchemaSync,
} from './utils';

// DocumentDB-specific
export { DocumentDBEncryptionService } from './documentdb-encryption-service';
export {
    toObjectId,
    toObjectIdArray,
    fromObjectId,
    findOne,
    findMany,
    insertOne,
    updateOne,
    deleteOne,
    deleteMany,
    aggregate,
} from './documentdb-utils';
export type { FindManyOptions } from './documentdb-utils';

