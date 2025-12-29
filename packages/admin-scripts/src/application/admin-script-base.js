const { createScriptExecutionRepository } = require('@friggframework/core/admin-scripts/repositories/script-execution-repository-factory');
const { createAdminApiKeyRepository } = require('@friggframework/core/admin-scripts/repositories/admin-api-key-repository-factory');

/**
 * Admin Script Base Class
 *
 * Base class for all admin scripts. Provides:
 * - Standard script definition pattern
 * - Repository access
 * - Logging helpers
 * - Integration factory support (optional)
 *
 * Usage:
 * ```javascript
 * class MyScript extends AdminScriptBase {
 *   static Definition = {
 *     name: 'my-script',
 *     version: '1.0.0',
 *     description: 'Does something useful',
 *     ...
 *   };
 *
 *   async execute(frigg, params) {
 *     // Your script logic here
 *   }
 * }
 * ```
 */
class AdminScriptBase {
    /**
     * CHILDREN SHOULD SPECIFY A DEFINITION FOR THE SCRIPT
     * Pattern matches IntegrationBase.Definition
     */
    static Definition = {
        name: 'Script Name', // Required: unique identifier
        version: '0.0.0', // Required: semver for migrations
        description: 'What this script does', // Required: human-readable

        // Script-specific properties
        source: 'USER_DEFINED', // 'BUILTIN' | 'USER_DEFINED'

        inputSchema: null, // Optional: JSON Schema for params
        outputSchema: null, // Optional: JSON Schema for results

        schedule: {
            // Optional: Phase 2
            enabled: false,
            cronExpression: null, // 'cron(0 12 * * ? *)'
        },

        config: {
            timeout: 300000, // Default 5 min (ms)
            maxRetries: 0,
            requiresIntegrationFactory: false, // Hint: does script need to instantiate integrations?
        },

        display: {
            // For future UI
            label: 'Script Name',
            description: '',
            category: 'maintenance', // 'maintenance' | 'healing' | 'sync' | 'custom'
        },
    };

    static getName() {
        return this.Definition.name;
    }

    static getCurrentVersion() {
        return this.Definition.version;
    }

    static getDefinition() {
        return this.Definition;
    }

    /**
     * Constructor receives dependencies
     * Pattern matches IntegrationBase constructor
     */
    constructor(params = {}) {
        this.executionId = params.executionId || null;
        this.logs = [];
        this._startTime = null;

        // OPTIONAL: Integration factory for scripts that need it
        this.integrationFactory = params.integrationFactory || null;

        // OPTIONAL: Injected repositories (for testing or custom implementations)
        this.scriptExecutionRepository = params.scriptExecutionRepository || null;
        this.adminApiKeyRepository = params.adminApiKeyRepository || null;
    }

    /**
     * CHILDREN MUST IMPLEMENT THIS METHOD
     * @param {AdminFriggCommands} frigg - Helper commands object
     * @param {Object} params - Script parameters (validated against inputSchema)
     * @returns {Promise<Object>} - Script results (validated against outputSchema)
     */
    async execute(frigg, params) {
        throw new Error('AdminScriptBase.execute() must be implemented by subclass');
    }

    /**
     * Logging helper
     * @param {string} level - Log level (info, warn, error, debug)
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     * @returns {Object} Log entry
     */
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

    /**
     * Get all logs
     * @returns {Array} Log entries
     */
    getLogs() {
        return this.logs;
    }

    /**
     * Clear all logs
     */
    clearLogs() {
        this.logs = [];
    }
}

module.exports = { AdminScriptBase };
