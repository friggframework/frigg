const Boom = require('@hapi/boom');

/**
 * Upsert Schedule Use Case
 *
 * Application Layer - Hexagonal Architecture
 *
 * Creates or updates a schedule override with external scheduler provisioning.
 * Abstracts scheduler provider (AWS EventBridge, etc.) behind schedulerAdapter.
 */
class UpsertScheduleUseCase {
    constructor({ commands, schedulerAdapter, scriptFactory }) {
        this.commands = commands;
        this.schedulerAdapter = schedulerAdapter;
        this.scriptFactory = scriptFactory;
    }

    /**
     * Create or update a schedule
     * @param {string} scriptName - Name of the script
     * @param {Object} input - Schedule configuration
     * @param {boolean} input.enabled - Whether schedule is enabled
     * @param {string} [input.cronExpression] - Cron expression (required if enabled)
     * @param {string} [input.timezone] - Timezone (defaults to UTC)
     * @returns {Promise<{success: boolean, schedule: Object, schedulerWarning?: string}>}
     */
    async execute(scriptName, { enabled, cronExpression, timezone }) {
        this._validateScriptExists(scriptName);
        this._validateInput(enabled, cronExpression);

        // Save to database
        const schedule = await this.commands.upsertSchedule({
            scriptName,
            enabled,
            cronExpression: cronExpression || null,
            timezone: timezone || 'UTC',
        });

        // Sync with external scheduler (AWS EventBridge, etc.)
        const schedulerResult = await this._syncExternalScheduler(
            scriptName,
            enabled,
            cronExpression,
            timezone,
            schedule.externalScheduleId
        );

        return {
            success: true,
            schedule: {
                ...schedule,
                externalScheduleId:
                    schedulerResult.externalScheduleId ||
                    schedule.externalScheduleId,
                externalScheduleName:
                    schedulerResult.externalScheduleName ||
                    schedule.externalScheduleName,
            },
            ...(schedulerResult.warning && {
                schedulerWarning: schedulerResult.warning,
            }),
        };
    }

    /**
     * @private
     */
    _validateScriptExists(scriptName) {
        if (!this.scriptFactory.has(scriptName)) {
            throw Boom.notFound(`Script "${scriptName}" not found`);
        }
    }

    /**
     * @private
     */
    _validateInput(enabled, cronExpression) {
        if (typeof enabled !== 'boolean') {
            throw Boom.badRequest('enabled must be a boolean');
        }

        if (enabled && !cronExpression) {
            throw Boom.badRequest(
                'cronExpression is required when enabled is true'
            );
        }
    }

    /**
     * Sync with external scheduler service
     * Abstracts AWS EventBridge or other scheduler providers
     * @private
     */
    async _syncExternalScheduler(
        scriptName,
        enabled,
        cronExpression,
        timezone,
        existingId
    ) {
        const result = {
            externalScheduleId: null,
            externalScheduleName: null,
            warning: null,
        };

        try {
            if (enabled && cronExpression) {
                // Create/update external schedule
                const schedulerInfo =
                    await this.schedulerAdapter.createSchedule({
                        scriptName,
                        cronExpression,
                        timezone: timezone || 'UTC',
                    });

                if (schedulerInfo?.scheduleArn) {
                    await this.commands.updateScheduleExternalInfo(scriptName, {
                        externalScheduleId: schedulerInfo.scheduleArn,
                        externalScheduleName: schedulerInfo.scheduleName,
                    });
                    result.externalScheduleId = schedulerInfo.scheduleArn;
                    result.externalScheduleName = schedulerInfo.scheduleName;
                }
            } else if (!enabled && existingId) {
                // Delete external schedule
                await this.schedulerAdapter.deleteSchedule(scriptName);
                await this.commands.updateScheduleExternalInfo(scriptName, {
                    externalScheduleId: null,
                    externalScheduleName: null,
                });
            }
        } catch (error) {
            // Non-fatal: DB schedule is saved, external scheduler can be retried
            result.warning = error.message;
        }

        return result;
    }
}

module.exports = { UpsertScheduleUseCase };
