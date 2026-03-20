export { EncryptionLogger, logger } from './logger';
export {
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
} from './encryption-schema-registry';
export type {
    EncryptionModelConfig,
    EncryptionSchema,
    ValidationResult,
    ModuleDefinition,
    IntegrationClass,
} from './encryption-schema-registry';
export { FieldEncryptionService } from './field-encryption-service';
export type { EncryptionSchemaProvider } from './field-encryption-service';
export { createEncryptionExtension } from './prisma-encryption-extension';

