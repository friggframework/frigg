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
 *
 * Authentication:
 * - Uses ENV-based ADMIN_API_KEY (see handlers/middleware/admin-auth.js)
 * - No database-backed API keys (simplified from original design)
 */

// Repository Interfaces
const { ScriptExecutionRepositoryInterface } = require('./repositories/script-execution-repository-interface');
const { ScriptScheduleRepositoryInterface } = require('./repositories/script-schedule-repository-interface');

// Repository Factories
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
    ScriptExecutionRepositoryInterface,
    ScriptScheduleRepositoryInterface,

    // Repository Factories (primary exports for use cases)
    createScriptExecutionRepository,
    createScriptScheduleRepository,

    // Concrete Implementations (for testing)
    ScriptExecutionRepositoryMongo,
    ScriptExecutionRepositoryPostgres,
    ScriptExecutionRepositoryDocumentDB,
    ScriptScheduleRepositoryMongo,
    ScriptScheduleRepositoryPostgres,
    ScriptScheduleRepositoryDocumentDB,
};
