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
const { AdminProcessRepositoryInterface } = require('./repositories/admin-process-repository-interface');
const { ScriptScheduleRepositoryInterface } = require('./repositories/script-schedule-repository-interface');

// Repository Factories
const {
    createAdminProcessRepository,
    AdminProcessRepositoryMongo,
    AdminProcessRepositoryPostgres,
    AdminProcessRepositoryDocumentDB,
} = require('./repositories/admin-process-repository-factory');
const {
    createScriptScheduleRepository,
    ScriptScheduleRepositoryMongo,
    ScriptScheduleRepositoryPostgres,
    ScriptScheduleRepositoryDocumentDB,
} = require('./repositories/script-schedule-repository-factory');

module.exports = {
    // Repository Interfaces
    AdminProcessRepositoryInterface,
    ScriptScheduleRepositoryInterface,

    // Repository Factories (primary exports for use cases)
    createAdminProcessRepository,
    createScriptScheduleRepository,

    // Concrete Implementations (for testing)
    AdminProcessRepositoryMongo,
    AdminProcessRepositoryPostgres,
    AdminProcessRepositoryDocumentDB,
    ScriptScheduleRepositoryMongo,
    ScriptScheduleRepositoryPostgres,
    ScriptScheduleRepositoryDocumentDB,
};
