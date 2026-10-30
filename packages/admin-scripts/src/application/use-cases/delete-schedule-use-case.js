const Boom = require('@hapi/boom');

/**
 * Delete Schedule Use Case
 *
 * Application Layer - Hexagonal Architecture
 *
 * Deletes a schedule override and cleans up external scheduler resources.
 */
class DeleteScheduleUseCase {
    constructor({ commands, schedulerAdapter, scriptFactory }) {
        this.commands = commands;
        this.schedulerAdapter = schedulerAdapter;
        this.scriptFactory = scriptFactory;
    }

    /**
     * Delete a schedule override
     * @param {string} scriptName - Name of the script
     * @returns {Promise<{success: boolean, deletedCount: number, message: string, effectiveSchedule: Object, schedulerWarning?: string}>}
     */
    async execute(scriptName) {
        this._validateScriptExists(scriptName);

        // Delete from database
        const deleteResult = await this.commands.deleteSchedule(scriptName);

        // Cleanup external scheduler if needed
        const schedulerWarning = await this._cleanupExternalScheduler(
            scriptName,
            deleteResult.deleted?.externalScheduleId
        );

        const effectiveSchedule = { source: 'none', enabled: false };

        return {
            success: true,
            deletedCount: deleteResult.deletedCount,
            message:
                deleteResult.deletedCount > 0
                    ? 'Schedule override removed'
                    : 'No schedule override found',
            effectiveSchedule,
            ...(schedulerWarning && { schedulerWarning }),
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
     * Cleanup external scheduler resources
     * @private
     */
    async _cleanupExternalScheduler(scriptName, externalScheduleId) {
        if (!externalScheduleId) {
            return null;
        }

        try {
            await this.schedulerAdapter.deleteSchedule(scriptName);
            return null;
        } catch (error) {
            // Non-fatal: DB is cleaned up, external scheduler can be retried
            return error.message;
        }
    }
}

module.exports = { DeleteScheduleUseCase };
