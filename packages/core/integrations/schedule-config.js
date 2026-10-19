/**
 * An integration's schedule configuration (`static Definition.schedule`),
 * read by hosts that tick ONGOING_SYNC from a cron (provider-netlify's
 * scheduled-sync function).
 *
 *   schedule: {
 *       // 'class' (default): one ONGOING_SYNC per integration class per tick,
 *       //   with no integration id: the worker runs it on an unhydrated
 *       //   instance, so the handler finds its own installations.
 *       // 'installation': one ONGOING_SYNC per ENABLED integration record of
 *       //   the class, carrying `data.integrationId`, so the worker hydrates
 *       //   that installation before the handler runs.
 *       scope: 'installation',
 *       // Optional, 'installation' only: (integration, { now }) => boolean |
 *       // Promise<boolean>. Return false to skip that installation this tick.
 *       // Without it every installation is dispatched on every tick.
 *       isDue: (integration, { now }) => true,
 *   }
 *
 * Validated at load (loadAppDefinition) so a mistyped scope stops the app
 * rather than silently falling back to 'class'.
 */

const SCHEDULE_SCOPES = Object.freeze({
    CLASS: 'class',
    INSTALLATION: 'installation',
});

const DEFAULT_SCHEDULE_SCOPE = SCHEDULE_SCOPES.CLASS;

class ScheduleConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ScheduleConfigError';
        this.code = 'SCHEDULE_CONFIG_INVALID';
    }
}

/**
 * @param {Object} [definition] - an integration's static Definition
 * @returns {{ scope: 'class'|'installation', isDue: Function|null }}
 * @throws {ScheduleConfigError} when `schedule` is malformed
 */
function resolveScheduleConfig(definition) {
    const name = definition?.name || 'integration';
    const schedule = definition?.schedule;
    if (schedule === undefined || schedule === null) {
        return { scope: DEFAULT_SCHEDULE_SCOPE, isDue: null };
    }
    if (typeof schedule !== 'object' || Array.isArray(schedule)) {
        throw new ScheduleConfigError(`${name}: Definition.schedule must be an object`);
    }

    const scopes = Object.values(SCHEDULE_SCOPES);
    const scope = schedule.scope === undefined ? DEFAULT_SCHEDULE_SCOPE : schedule.scope;
    if (!scopes.includes(scope)) {
        throw new ScheduleConfigError(
            `${name}: Definition.schedule.scope must be one of ${scopes.map((s) => `'${s}'`).join(', ')} (got ${JSON.stringify(schedule.scope)})`
        );
    }

    const isDue = schedule.isDue === undefined ? null : schedule.isDue;
    if (isDue !== null && typeof isDue !== 'function') {
        throw new ScheduleConfigError(`${name}: Definition.schedule.isDue must be a function`);
    }
    if (isDue && scope !== SCHEDULE_SCOPES.INSTALLATION) {
        throw new ScheduleConfigError(
            `${name}: Definition.schedule.isDue applies to scope 'installation' only`
        );
    }

    return { scope, isDue };
}

module.exports = {
    SCHEDULE_SCOPES,
    DEFAULT_SCHEDULE_SCOPE,
    ScheduleConfigError,
    resolveScheduleConfig,
};
