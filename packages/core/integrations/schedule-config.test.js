const {
    resolveScheduleConfig,
    ScheduleConfigError,
    DEFAULT_SCHEDULE_SCOPE,
} = require('./schedule-config');

describe('resolveScheduleConfig', () => {
    it("defaults to scope 'class' (unchanged behaviour) with no due check", () => {
        expect(DEFAULT_SCHEDULE_SCOPE).toBe('class');
        expect(resolveScheduleConfig({ name: 'crm' })).toEqual({ scope: 'class', isDue: null });
        expect(resolveScheduleConfig({ name: 'crm', schedule: {} })).toEqual({ scope: 'class', isDue: null });
        expect(resolveScheduleConfig(undefined)).toEqual({ scope: 'class', isDue: null });
    });

    it("accepts scope 'installation' with an optional isDue", () => {
        const isDue = () => true;
        expect(resolveScheduleConfig({ schedule: { scope: 'installation' } })).toEqual({
            scope: 'installation',
            isDue: null,
        });
        expect(resolveScheduleConfig({ schedule: { scope: 'installation', isDue } })).toEqual({
            scope: 'installation',
            isDue,
        });
    });

    it.each([
        [{ schedule: 'installation' }, /must be an object/],
        [{ schedule: [] }, /must be an object/],
        [{ schedule: { scope: 'installations' } }, /scope must be one of 'class', 'installation'/],
        [{ schedule: { scope: null } }, /scope must be one of/],
        [{ schedule: { scope: 'installation', isDue: true } }, /isDue must be a function/],
        [{ schedule: { scope: 'class', isDue: () => true } }, /isDue applies to scope 'installation' only/],
    ])('refuses %j', (definition, message) => {
        expect(() => resolveScheduleConfig({ name: 'crm', ...definition })).toThrow(ScheduleConfigError);
        expect(() => resolveScheduleConfig({ name: 'crm', ...definition })).toThrow(message);
    });
});
