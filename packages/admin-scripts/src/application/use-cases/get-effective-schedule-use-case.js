const Boom = require('@hapi/boom');

/**
 * Get Effective Schedule Use Case
 *
 * Application Layer - Hexagonal Architecture
 *
 * Returns the script's database schedule, or a disabled schedule when none exists.
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

        const dbSchedule = await this.commands.getScheduleByScriptName(
            scriptName
        );
        if (dbSchedule) {
            return {
                source: 'database',
                schedule: dbSchedule,
            };
        }

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
