/**
 * Schedule Management Use Case
 *
 * Application Layer - Hexagonal Architecture
 *
 * Orchestrates schedule management operations:
 * - Get effective schedule (DB override > Definition > none)
 * - Upsert schedule with EventBridge provisioning
 * - Delete schedule with EventBridge cleanup
 *
 * This use case encapsulates the business logic that was previously
 * embedded in the router, reducing cognitive complexity and improving testability.
 */
class ScheduleManagementUseCase {
    constructor({ commands, schedulerAdapter, scriptFactory }) {
        this.commands = commands;
        this.schedulerAdapter = schedulerAdapter;
        this.scriptFactory = scriptFactory;
    }

    /**
     * Validate that a script exists
     * @private
     */
    _validateScriptExists(scriptName) {
        if (!this.scriptFactory.has(scriptName)) {
            const error = new Error(`Script "${scriptName}" not found`);
            error.code = 'SCRIPT_NOT_FOUND';
            throw error;
        }
    }

    /**
     * Get the definition schedule from a script class
     * @private
     */
    _getDefinitionSchedule(scriptName) {
        const scriptClass = this.scriptFactory.get(scriptName);
        return scriptClass.Definition?.schedule || null;
    }

    /**
     * Get effective schedule (DB override > Definition default > none)
     */
    async getEffectiveSchedule(scriptName) {
        this._validateScriptExists(scriptName);

        // Check database override first
        const dbSchedule = await this.commands.getScheduleByScriptName(scriptName);
        if (dbSchedule) {
            return {
                source: 'database',
                schedule: dbSchedule,
            };
        }

        // Check definition default
        const definitionSchedule = this._getDefinitionSchedule(scriptName);
        if (definitionSchedule?.enabled) {
            return {
                source: 'definition',
                schedule: {
                    scriptName,
                    enabled: definitionSchedule.enabled,
                    cronExpression: definitionSchedule.cronExpression,
                    timezone: definitionSchedule.timezone || 'UTC',
                },
            };
        }

        // No schedule configured
        return {
            source: 'none',
            schedule: {
                scriptName,
                enabled: false,
            },
        };
    }

    /**
     * Create or update schedule with EventBridge provisioning
     */
    async upsertSchedule(scriptName, { enabled, cronExpression, timezone }) {
        this._validateScriptExists(scriptName);
        this._validateScheduleInput(enabled, cronExpression);

        // Save to database
        const schedule = await this.commands.upsertSchedule({
            scriptName,
            enabled,
            cronExpression: cronExpression || null,
            timezone: timezone || 'UTC',
        });

        // Provision/deprovision EventBridge
        const schedulerResult = await this._syncEventBridgeSchedule(
            scriptName,
            enabled,
            cronExpression,
            timezone,
            schedule.awsScheduleArn
        );

        return {
            success: true,
            schedule: {
                ...schedule,
                awsScheduleArn: schedulerResult.awsScheduleArn || schedule.awsScheduleArn,
                awsScheduleName: schedulerResult.awsScheduleName || schedule.awsScheduleName,
            },
            ...(schedulerResult.warning && { schedulerWarning: schedulerResult.warning }),
        };
    }

    /**
     * Validate schedule input
     * @private
     */
    _validateScheduleInput(enabled, cronExpression) {
        if (typeof enabled !== 'boolean') {
            const error = new Error('enabled must be a boolean');
            error.code = 'INVALID_INPUT';
            throw error;
        }

        if (enabled && !cronExpression) {
            const error = new Error('cronExpression is required when enabled is true');
            error.code = 'INVALID_INPUT';
            throw error;
        }
    }

    /**
     * Sync EventBridge schedule based on enabled state
     * @private
     */
    async _syncEventBridgeSchedule(scriptName, enabled, cronExpression, timezone, existingArn) {
        const result = { awsScheduleArn: null, awsScheduleName: null, warning: null };

        try {
            if (enabled && cronExpression) {
                // Create/update EventBridge schedule
                const awsInfo = await this.schedulerAdapter.createSchedule({
                    scriptName,
                    cronExpression,
                    timezone: timezone || 'UTC',
                });

                if (awsInfo?.scheduleArn) {
                    await this.commands.updateScheduleAwsInfo(scriptName, {
                        awsScheduleArn: awsInfo.scheduleArn,
                        awsScheduleName: awsInfo.scheduleName,
                    });
                    result.awsScheduleArn = awsInfo.scheduleArn;
                    result.awsScheduleName = awsInfo.scheduleName;
                }
            } else if (!enabled && existingArn) {
                // Delete EventBridge schedule
                await this.schedulerAdapter.deleteSchedule(scriptName);
                await this.commands.updateScheduleAwsInfo(scriptName, {
                    awsScheduleArn: null,
                    awsScheduleName: null,
                });
            }
        } catch (error) {
            // Non-fatal: DB schedule is saved, AWS can be retried
            result.warning = error.message;
        }

        return result;
    }

    /**
     * Delete schedule override and cleanup EventBridge
     */
    async deleteSchedule(scriptName) {
        this._validateScriptExists(scriptName);

        // Delete from database
        const deleteResult = await this.commands.deleteSchedule(scriptName);

        // Cleanup EventBridge if needed
        const schedulerWarning = await this._cleanupEventBridgeSchedule(
            scriptName,
            deleteResult.deleted?.awsScheduleArn
        );

        // Get effective schedule after deletion
        const definitionSchedule = this._getDefinitionSchedule(scriptName);
        const effectiveSchedule = definitionSchedule?.enabled
            ? {
                source: 'definition',
                enabled: definitionSchedule.enabled,
                cronExpression: definitionSchedule.cronExpression,
                timezone: definitionSchedule.timezone || 'UTC',
            }
            : { source: 'none', enabled: false };

        return {
            success: true,
            deletedCount: deleteResult.deletedCount,
            message: deleteResult.deletedCount > 0
                ? 'Schedule override removed'
                : 'No schedule override found',
            effectiveSchedule,
            ...(schedulerWarning && { schedulerWarning }),
        };
    }

    /**
     * Cleanup EventBridge schedule if it exists
     * @private
     */
    async _cleanupEventBridgeSchedule(scriptName, awsScheduleArn) {
        if (!awsScheduleArn) {
            return null;
        }

        try {
            await this.schedulerAdapter.deleteSchedule(scriptName);
            return null;
        } catch (error) {
            // Non-fatal: DB is cleaned up, AWS can be retried
            return error.message;
        }
    }
}

module.exports = { ScheduleManagementUseCase };
