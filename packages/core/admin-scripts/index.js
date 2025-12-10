/**
 * Admin Scripts Module
 *
 * Exports repository interfaces and factories for admin script management.
 * Concrete implementations support MongoDB, PostgreSQL, and DocumentDB.
 *
 * Repository interfaces follow the Port pattern in Hexagonal Architecture:
 * - Define contracts for data access
 * - Enable dependency injection
 * - Allow testing with mocks
 * - Support multiple database implementations
 */

// Repository Interfaces
const { AdminApiKeyRepositoryInterface } = require('./repositories/admin-api-key-repository-interface');
const { ScriptExecutionRepositoryInterface } = require('./repositories/script-execution-repository-interface');
const { ScriptScheduleRepositoryInterface } = require('./repositories/script-schedule-repository-interface');

// Repository Factories
const {
    createAdminApiKeyRepository,
    AdminApiKeyRepositoryMongo,
    AdminApiKeyRepositoryPostgres,
    AdminApiKeyRepositoryDocumentDB,
} = require('./repositories/admin-api-key-repository-factory');
const {
    createScriptExecutionRepository,
    ScriptExecutionRepositoryMongo,
    ScriptExecutionRepositoryPostgres,
    ScriptExecutionRepositoryDocumentDB,
} = require('./repositories/script-execution-repository-factory');
const {
    createScriptScheduleRepository,
    ScriptScheduleRepositoryMongo,
    ScriptScheduleRepositoryPostgres,
    ScriptScheduleRepositoryDocumentDB,
} = require('./repositories/script-schedule-repository-factory');

module.exports = {
    // Repository Interfaces
    AdminApiKeyRepositoryInterface,
    ScriptExecutionRepositoryInterface,
    ScriptScheduleRepositoryInterface,

    // Repository Factories (primary exports for use cases)
    createAdminApiKeyRepository,
    createScriptExecutionRepository,
    createScriptScheduleRepository,

    // Concrete Implementations (for testing)
    AdminApiKeyRepositoryMongo,
    AdminApiKeyRepositoryPostgres,
    AdminApiKeyRepositoryDocumentDB,
    ScriptExecutionRepositoryMongo,
    ScriptExecutionRepositoryPostgres,
    ScriptExecutionRepositoryDocumentDB,
    ScriptScheduleRepositoryMongo,
    ScriptScheduleRepositoryPostgres,
    ScriptScheduleRepositoryDocumentDB,
};
