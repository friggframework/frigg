const { QueuerUtil } = require('@friggframework/core/queues');

/**
 * AdminFriggCommands
 *
 * Helper API for admin scripts. Provides:
 * - Database access via repositories
 * - Integration instantiation (optional)
 * - Logging utilities
 * - Queue operations for self-queuing pattern
 *
 * Follows lazy-loading pattern for repositories to avoid circular dependencies
 * and unnecessary initialization.
 */
class AdminFriggCommands {
    constructor(params = {}) {
        this.executionId = params.executionId || null;
        this.logs = [];

        // OPTIONAL: Integration factory for scripts that need external API access
        this.integrationFactory = params.integrationFactory || null;

        // Lazy-load repositories to avoid circular deps
        this._integrationRepository = null;
        this._userRepository = null;
        this._moduleRepository = null;
        this._credentialRepository = null;
        this._adminProcessRepository = null;
    }

    // ==================== LAZY-LOADED REPOSITORIES ====================

    get integrationRepository() {
        if (!this._integrationRepository) {
            const { createIntegrationRepository } = require('@friggframework/core/integrations/repositories/integration-repository-factory');
            this._integrationRepository = createIntegrationRepository();
        }
        return this._integrationRepository;
    }

    get userRepository() {
        if (!this._userRepository) {
            const { createUserRepository } = require('@friggframework/core/user/repositories/user-repository-factory');
            this._userRepository = createUserRepository();
        }
        return this._userRepository;
    }

    get moduleRepository() {
        if (!this._moduleRepository) {
            const { createModuleRepository } = require('@friggframework/core/modules/repositories/module-repository-factory');
            this._moduleRepository = createModuleRepository();
        }
        return this._moduleRepository;
    }

    get credentialRepository() {
        if (!this._credentialRepository) {
            const { createCredentialRepository } = require('@friggframework/core/credential/repositories/credential-repository-factory');
            this._credentialRepository = createCredentialRepository();
        }
        return this._credentialRepository;
    }

    get adminProcessRepository() {
        if (!this._adminProcessRepository) {
            const { createAdminProcessRepository } = require('@friggframework/core/admin-scripts/repositories/admin-process-repository-factory');
            this._adminProcessRepository = createAdminProcessRepository();
        }
        return this._adminProcessRepository;
    }

    // ==================== INTEGRATION QUERIES ====================

    async listIntegrations(filter = {}) {
        if (filter.userId) {
            return this.integrationRepository.findIntegrationsByUserId(filter.userId);
        }
        return this.integrationRepository.findIntegrations(filter);
    }

    async findIntegrationById(id) {
        return this.integrationRepository.findIntegrationById(id);
    }

    async findIntegrationsByUserId(userId) {
        return this.integrationRepository.findIntegrationsByUserId(userId);
    }

    async updateIntegrationConfig(integrationId, config) {
        return this.integrationRepository.updateIntegrationConfig(integrationId, config);
    }

    async updateIntegrationStatus(integrationId, status) {
        return this.integrationRepository.updateIntegrationStatus(integrationId, status);
    }

    // ==================== USER QUERIES ====================

    async findUserById(userId) {
        return this.userRepository.findIndividualUserById(userId);
    }

    async findUserByAppUserId(appUserId) {
        return this.userRepository.findIndividualUserByAppUserId(appUserId);
    }

    async findUserByUsername(username) {
        return this.userRepository.findIndividualUserByUsername(username);
    }

    // ==================== ENTITY QUERIES ====================

    async listEntities(filter = {}) {
        if (filter.userId) {
            return this.moduleRepository.findEntitiesByUserId(filter.userId);
        }
        return this.moduleRepository.findEntity(filter);
    }

    async findEntityById(entityId) {
        return this.moduleRepository.findEntityById(entityId);
    }

    // ==================== CREDENTIAL QUERIES ====================

    async findCredential(filter) {
        return this.credentialRepository.findCredential(filter);
    }

    async updateCredential(credentialId, updates) {
        return this.credentialRepository.updateCredential(credentialId, updates);
    }

    // ==================== INTEGRATION INSTANTIATION ====================

    /**
     * Instantiate an integration instance (for calling external APIs)
     * REQUIRES: integrationFactory in constructor
     */
    async instantiate(integrationId) {
        if (!this.integrationFactory) {
            throw new Error(
                'instantiate() requires integrationFactory. ' +
                'Set Definition.config.requiresIntegrationFactory = true'
            );
        }
        return this.integrationFactory.getInstanceFromIntegrationId({
            integrationId,
            _isAdminContext: true,  // Bypass user ownership check
        });
    }

    // ==================== QUEUE OPERATIONS (Self-Queuing Pattern) ====================

    /**
     * Queue a script for execution
     * Used for self-queuing pattern with long-running scripts
     */
    async queueScript(scriptName, params = {}) {
        const queueUrl = process.env.ADMIN_SCRIPT_QUEUE_URL;
        if (!queueUrl) {
            throw new Error('ADMIN_SCRIPT_QUEUE_URL environment variable not set');
        }

        await QueuerUtil.send(
            {
                scriptName,
                trigger: 'QUEUE',
                params,
                parentExecutionId: this.executionId,
            },
            queueUrl
        );

        this.log('info', `Queued continuation for ${scriptName}`, { params });
    }

    /**
     * Queue multiple scripts in a batch
     */
    async queueScriptBatch(entries) {
        const queueUrl = process.env.ADMIN_SCRIPT_QUEUE_URL;
        if (!queueUrl) {
            throw new Error('ADMIN_SCRIPT_QUEUE_URL environment variable not set');
        }

        const messages = entries.map(entry => ({
            scriptName: entry.scriptName,
            trigger: 'QUEUE',
            params: entry.params || {},
            parentExecutionId: this.executionId,
        }));

        await QueuerUtil.batchSend(messages, queueUrl);
        this.log('info', `Queued ${entries.length} script continuations`);
    }

    // ==================== LOGGING ====================

    log(level, message, data = {}) {
        const entry = {
            level,
            message,
            data,
            timestamp: new Date().toISOString(),
        };
        this.logs.push(entry);

        // Persist to execution record if we have an executionId
        if (this.executionId) {
            this.adminProcessRepository.appendProcessLog(this.executionId, entry)
                .catch(err => console.error('Failed to persist log:', err));
        }

        return entry;
    }

    getExecutionId() {
        return this.executionId;
    }

    getLogs() {
        return this.logs;
    }

    clearLogs() {
        this.logs = [];
    }
}

/**
 * Create AdminFriggCommands instance
 */
function createAdminFriggCommands(params = {}) {
    return new AdminFriggCommands(params);
}

module.exports = {
    AdminFriggCommands,
    createAdminFriggCommands,
};
