const { QueuerUtil } = require('@friggframework/core/queues');

/**
 * AdminScriptContext - Execution environment for admin scripts
 *
 * Provides a controlled surface area for scripts to interact with
 * the Frigg platform. Unique capabilities vs direct repo access:
 *
 * - **Admin bypass**: `instantiate()` passes `_isAdminContext: true` to
 *   skip user-ownership checks when loading integration instances
 * - **Script chaining**: `queueScript()` / `queueScriptBatch()` let scripts
 *   enqueue follow-up work with parent execution tracking
 * - **Execution-scoped logging**: `log()` collects structured entries tied
 *   to the current execution for post-run inspection
 * - **Lazy-loaded repositories**: Repos are exposed directly as getters
 *   so scripts can query any data they need without wrapper indirection
 */
class AdminScriptContext {
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
    }

    // ==================== LAZY-LOADED REPOSITORIES ====================

    get integrationRepository() {
        if (!this._integrationRepository) {
            const {
                createIntegrationRepository,
            } = require('@friggframework/core/integrations/repositories/integration-repository-factory');
            this._integrationRepository = createIntegrationRepository();
        }
        return this._integrationRepository;
    }

    get userRepository() {
        if (!this._userRepository) {
            const {
                createUserRepository,
            } = require('@friggframework/core/user/repositories/user-repository-factory');
            this._userRepository = createUserRepository();
        }
        return this._userRepository;
    }

    get moduleRepository() {
        if (!this._moduleRepository) {
            const {
                createModuleRepository,
            } = require('@friggframework/core/modules/repositories/module-repository-factory');
            this._moduleRepository = createModuleRepository();
        }
        return this._moduleRepository;
    }

    get credentialRepository() {
        if (!this._credentialRepository) {
            const {
                createCredentialRepository,
            } = require('@friggframework/core/credential/repositories/credential-repository-factory');
            this._credentialRepository = createCredentialRepository();
        }
        return this._credentialRepository;
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
                    'Set Definition.config.requireIntegrationInstance = true'
            );
        }
        return this.integrationFactory.getInstanceFromIntegrationId({
            integrationId,
            _isAdminContext: true, // Bypass user ownership check
        });
    }

    // ==================== QUEUE OPERATIONS ====================

    async queueScript(scriptName, params = {}) {
        const queueUrl = process.env.ADMIN_SCRIPT_QUEUE_URL;
        if (!queueUrl) {
            throw new Error(
                'ADMIN_SCRIPT_QUEUE_URL environment variable not set'
            );
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

    async queueScriptBatch(entries) {
        const queueUrl = process.env.ADMIN_SCRIPT_QUEUE_URL;
        if (!queueUrl) {
            throw new Error(
                'ADMIN_SCRIPT_QUEUE_URL environment variable not set'
            );
        }

        const messages = entries.map((entry) => ({
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
 * Create AdminScriptContext instance
 */
function createAdminScriptContext(params = {}) {
    return new AdminScriptContext(params);
}

// Legacy aliases for backwards compatibility
const AdminFriggCommands = AdminScriptContext;
const createAdminFriggCommands = createAdminScriptContext;

module.exports = {
    AdminScriptContext,
    createAdminScriptContext,
    // Legacy exports (deprecated)
    AdminFriggCommands,
    createAdminFriggCommands,
};
