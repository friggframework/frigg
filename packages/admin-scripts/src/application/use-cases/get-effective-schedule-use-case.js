/**
 * Get Effective Schedule Use Case
 *
 * Application Layer - Hexagonal Architecture
 *
 * Resolves the effective schedule for a script following priority:
 * 1. Database override (runtime configuration)
 * 2. Definition default (code-defined schedule)
 * 3. None (manual execution only)
 */
class GetEffectiveScheduleUseCase {
    constructor({ commands, scriptFactory }) {
        this.commands = commands;
        this.scriptFactory = scriptFactory;
    }

    /**
     * Get effective schedule for a script
     * @param {string} scriptName - Name of the script
     * @returns {Promise<{source: 'database'|'definition'|'none', schedule: Object}>}
     */
    async execute(scriptName) {
        this._validateScriptExists(scriptName);

        // Priority 1: Database override
        const dbSchedule = await this.commands.getScheduleByScriptName(scriptName);
        if (dbSchedule) {
            return {
                source: 'database',
                schedule: dbSchedule,
            };
        }

        // Priority 2: Definition default
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

        // Priority 3: No schedule
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
            const error = new Error(`Script "${scriptName}" not found`);
            error.code = 'SCRIPT_NOT_FOUND';
            throw error;
        }
    }

    /**
     * @private
     */
    _getDefinitionSchedule(scriptName) {
        const scriptClass = this.scriptFactory.get(scriptName);
        return scriptClass.Definition?.schedule || null;
    }
}

module.exports = { GetEffectiveScheduleUseCase };
