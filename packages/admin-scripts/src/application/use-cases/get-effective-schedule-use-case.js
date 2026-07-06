const Boom = require('@hapi/boom');

/**
 * Get Effective Schedule Use Case
 *
 * Application Layer - Hexagonal Architecture
 *
 * Resolves the effective schedule for a script:
 * 1. Database override (activated at runtime via PUT /schedule)
 * 2. None (script is declared but not actively scheduled)
 *
 * Schedules are never derived from the script Definition — a script declares
 * a capability; an admin activates a schedule explicitly via the API.
 */
class GetEffectiveScheduleUseCase {
    constructor({ commands, scriptFactory }) {
        this.commands = commands;
        this.scriptFactory = scriptFactory;
    }

    /**
     * Get effective schedule for a script
     * @param {string} scriptName - Name of the script
     * @returns {Promise<{source: 'database'|'none', schedule: Object}>}
     */
    async execute(scriptName) {
        this._validateScriptExists(scriptName);

        // Priority 1: Database override
        const dbSchedule = await this.commands.getScheduleByScriptName(
            scriptName
        );
        if (dbSchedule) {
            return {
                source: 'database',
                schedule: dbSchedule,
            };
        }

        // No database override: the script is declared but not actively
        // scheduled. Admins activate scheduling explicitly via PUT /schedule.
        return {
            source: 'none',
            schedule: {
                scriptName,
                enabled: false,
            },
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
}

module.exports = { GetEffectiveScheduleUseCase };
