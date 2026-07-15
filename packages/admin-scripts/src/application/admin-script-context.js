const { QueuerUtil } = require('@friggframework/core/queues');

/**
 * AdminScriptContext - Execution environment for admin scripts
 *
 * Provides a controlled surface area for scripts to interact with the Frigg
 * platform. Scripts touch the database only through injected Frigg commands
 * (`context.commands`) — never through repositories directly. Capabilities:
 *
 * - **Frigg commands**: `commands.users`, `commands.credentials`,
 *   `commands.entities`, and `commands.integrations` expose the framework's
 *   command layer. Each command returns data on success or an `{ error }`
 *   object on failure — scripts check `.error` themselves.
 * - **Integration instantiation**: `instantiate(integrationId)` hydrates a live
 *   integration instance (system-scoped load) for calling external APIs
 * - **Script chaining**: `queueScript()` / `queueScriptBatch()` let scripts
 *   enqueue follow-up work with parent execution tracking
 * - **Execution-scoped logging**: `log()` collects structured entries tied
 *   to the current execution for post-run inspection
 */
class AdminScriptContext {
    /**
     * @param {Object} [params={}] - Context configuration
     * @param {string|number|null} [params.executionId] - ID of the AdminScriptExecution record this context is scoped to (used for log persistence and script chaining)
     * @param {Object|null} [params.integrationFactory] - Factory used to hydrate integration instances; required for scripts that call instantiate()
     * @param {Object|null} [params.commands] - Frigg command bundle ({ users, credentials, entities, integrations }) injected by the composition root and exposed to scripts as context.commands
     */
    constructor(params = {}) {
        this.executionId = params.executionId || null;
        this.logs = [];

        this.integrationFactory = params.integrationFactory || null;

        // Scripts interact with the database only through these Frigg commands.
        // Injected by bootstrap.js — the context never reaches for repositories
        // or command factories itself.
        this.commands = params.commands || null;

        // The AWS Lambda context, when running in the executor. Reports use
        // getRemainingTimeInMillis() to chunk long work and yield before the
        // Lambda timeout (see the report self-requeue mechanism).
        this.lambdaContext = params.lambdaContext || null;
    }

    /**
     * Milliseconds left before the Lambda times out, or Infinity when there is
     * no Lambda context (live runs, local dev, tests).
     */
    getRemainingTimeInMillis() {
        return this.lambdaContext &&
            typeof this.lambdaContext.getRemainingTimeInMillis === 'function'
            ? this.lambdaContext.getRemainingTimeInMillis()
            : Infinity;
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
        });
    }

    // ==================== QUEUE OPERATIONS ====================

    /**
     * Enqueue a follow-up script as an async continuation of this execution.
     *
     * Fire-and-forget: the child runs later in the executor Lambda (trigger
     * `QUEUE`) with its `parentExecutionId` set to this execution — you do NOT
     * get the child's result back here. Use it to split work that won't fit one
     * execution (paging past the 15-min executor timeout, per-item fan-out,
     * multi-stage pipelines).
     *
     * Caveats: delivery is at-least-once, so child scripts must be idempotent;
     * and there is no recursion/depth guard, so a script that queues itself
     * fans out unbounded — keep continuation targets terminal or bound the chain
     * yourself.
     *
     * @param {string} scriptName - Registered name of the script to enqueue
     * @param {Object} [params={}] - Params passed to the child's execute()
     * @throws {Error} if ADMIN_SCRIPT_QUEUE_URL is not configured
     */
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

    /**
     * Enqueue many follow-up scripts at once (batched to SQS). Same semantics
     * and caveats as {@link queueScript} — each child runs async with this
     * execution as its parent; make children idempotent and keep them terminal.
     *
     * @param {Array<{scriptName: string, params?: Object}>} entries - Scripts to enqueue
     * @throws {Error} if ADMIN_SCRIPT_QUEUE_URL is not configured
     */
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

module.exports = {
    AdminScriptContext,
    createAdminScriptContext,
};
