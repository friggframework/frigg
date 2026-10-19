/**
 * Recurring triggers (ADR-055 + its ADR-063 amendment): declarations, what devtools provisions, how one installation
 * resolves a trigger (config, `when`, a chosen timing within its floor) and the stateless due check.
 */
const {
    validateTriggers,
    provisioningOf,
    hasTriggers,
    tickMinutesOf,
    resolveTrigger,
    dueRun,
    hashId,
    slotStart,
    durationOf,
} = require('../triggers');

const MIN = 60000;
const handler = 'run';

describe('declarations', () => {
    it('accepts the ADR-055 shapes and the amendment\'s configurable / cron forms', () => {
        expect(validateTriggers({
            poll: { every: '15m', handler },
            perPlan: { every: (c) => c.pollEvery, when: (c) => c.on, overlap: 'allow', handler: async () => {} },
            nightly: { at: 'cron(0 3 * * ? *)', timezone: 'Europe/London', handler },
            digest: { cron: '0 8 * * 1-5', timezone: 'America/New_York', configurable: { min: '1h' }, handler },
            sync: { every: '1h', configurable: true, tick: '5m', handler },
        })).toEqual([]);
    });

    it('refuses what no tick can run, and says which trigger', () => {
        expect(validateTriggers({
            none: { handler },
            both: { every: '1h', at: 'cron(0 3 * * ? *)', handler },
            noHandler: { every: '1h' },
            badOverlap: { every: '1h', overlap: 'queue', handler },
            tooLong: { every: '2d', handler },
            badAt: { at: '0 3 * * *', handler },
            atConfigurable: { at: 'cron(0 3 * * ? *)', configurable: true, handler },
            badZone: { cron: '0 8 * * *', timezone: 'Mars/Base', handler },
            ownFloor: { every: '10m', configurable: { min: '15m' }, handler },
            badTick: { every: '1h', tick: '30s', handler },
        })).toEqual([
            'none: Give exactly one of every, at or cron',
            'both: Give exactly one of every, at or cron',
            'noHandler: handler must be a function or a method name',
            'badOverlap: overlap must be skip or allow',
            'tooLong: every "2d" is longer than 1d; use at or cron',
            'badAt: at "0 3 * * *" must be an EventBridge cron(...) expression with six fields',
            'atConfigurable: An at trigger runs at one time for every installation; use cron to let installations choose',
            'badZone: Unknown time zone "Mars/Base"',
            'ownFloor: The default breaks its own minimum: Runs every 10 minutes at its most frequent; the minimum is 15m',
            'badTick: tick "30s" is not a duration between 1m and 1d',
        ]);
    });

    it('ticks: tick when set, a constant every, 5m for a function, the floor when configurable, 5m or less for cron', () => {
        expect(tickMinutesOf({ every: '1h', tick: '10m' })).toBe(10);
        expect(tickMinutesOf({ every: '1h' })).toBe(60);
        expect(tickMinutesOf({ every: () => '1h' })).toBe(5);
        expect(tickMinutesOf({ every: '1h', configurable: { min: '15m' } })).toBe(15);
        expect(tickMinutesOf({ every: '1h', configurable: true })).toBe(5);
        expect(tickMinutesOf({ cron: '0 8 * * *' })).toBe(5);
        expect(tickMinutesOf({ cron: '*/2 * * * *' })).toBe(2);
        expect(tickMinutesOf({ at: 'cron(0 3 * * ? *)' })).toBeNull();
    });

    it('provisions one entry per distinct tick and one per at trigger, from Definition.triggers and instanceTriggers', () => {
        class Code { static Definition = { name: 'code', triggers: {
            a: { every: '15m', handler }, b: { every: '1h', configurable: { min: '15m' }, handler },
            c: { cron: '0 8 * * 1-5', timezone: 'America/New_York', handler }, d: { at: 'cron(0 3 * * ? *)', timezone: 'Europe/London', handler },
        } }; }
        expect(provisioningOf(Code)).toEqual({ ticks: [5, 15], at: [{ name: 'd', at: 'cron(0 3 * * ? *)', timezone: 'Europe/London' }] });
        class Defined { static Definition = { name: 'defined', instanceTriggers: { tick: '5m' } }; }
        expect(provisioningOf(Defined)).toEqual({ ticks: [5], at: [] });
        expect(hasTriggers(Defined)).toBe(true);
        expect(hasTriggers(class { static Definition = { name: 'none', triggers: {} }; })).toBe(false);
        class Bad { static Definition = { name: 'bad', triggers: { x: { every: 'often', handler } } }; }
        expect(() => provisioningOf(Bad)).toThrow(/Integration "bad" declares invalid triggers: x: every "often"/);
        expect([1, 5, 60, 90, 1440].map(durationOf)).toEqual(['1m', '5m', '1h', '90m', '1d']);
    });
});

describe('one installation', () => {
    const sync = { every: '1h', configurable: { min: '15m' }, handler };

    it('uses the default, or the installation\'s choice (config.triggers.<name>) where the floor allows it', () => {
        expect(resolveTrigger('sync', sync, {})).toMatchObject({ recurrence: { every: '1h' }, tickMinutes: 15, cadence: 4, source: 'definition', active: true, problems: [] });
        expect(resolveTrigger('sync', sync, { triggers: { sync: { every: '30m' } } })).toMatchObject({ recurrence: { every: '30m' }, cadence: 2, source: 'installation' });
        // A cadence rounds up to whole ticks: 20m on a 15m tick runs every 2 ticks (30m).
        expect(resolveTrigger('sync', sync, { triggers: { sync: { every: '20m' } } }).cadence).toBe(2);
        expect(resolveTrigger('sync', sync, { triggers: { sync: { cron: '0 9 * * 1-5', timezone: 'Europe/Paris' } } })).toMatchObject({ recurrence: { cron: '0 9 * * 1-5', timezone: 'Europe/Paris' }, source: 'installation' });
    });

    it('keeps the default and reports it when a choice breaks the floor, or the trigger is fixed', () => {
        expect(resolveTrigger('sync', sync, { triggers: { sync: { every: '5m' } } })).toMatchObject({
            recurrence: { every: '1h' }, source: 'definition', active: true, problems: ['Runs every 5 minutes at its most frequent; the minimum is 15m'],
        });
        expect(resolveTrigger('sync', sync, { triggers: { sync: { cron: '*/5 * * * *' } } }).problems).toEqual(['Runs every 5 minutes at its most frequent; the minimum is 15m']);
        expect(resolveTrigger('sync', sync, { triggers: { sync: { every: '3d' } } })).toMatchObject({ recurrence: { every: '1h' }, problems: ['every "3d" is longer than 1d'] });
        const fixed = { every: '1h', handler };
        expect(resolveTrigger('fixed', fixed, { triggers: { fixed: { every: '30m' } } })).toMatchObject({ recurrence: { every: '1h' }, problems: ['This trigger is not configurable'] });
    });

    it('a choice handed in by the caller (data-defined: workflows.<id>.schedule) wins over config.triggers', () => {
        expect(resolveTrigger('wf', { ...sync, choice: { every: '2h' } }, { triggers: { wf: { every: '30m' } } }).recurrence).toEqual({ every: '2h' });
    });

    it('is inactive when `when` excludes the installation, or it paused a configurable trigger', () => {
        const gated = { every: '15m', when: (c) => c.direction !== 'crm->erp', handler };
        expect(resolveTrigger('g', gated, { direction: 'crm->erp' })).toMatchObject({ active: false, inactive: 'when' });
        expect(resolveTrigger('g', gated, { direction: 'two-way' }).active).toBe(true);
        expect(resolveTrigger('sync', sync, { triggers: { sync: { enabled: false } } })).toMatchObject({ active: false, inactive: 'paused' });
        expect(resolveTrigger('f', { every: '1h', handler }, { triggers: { f: { enabled: false } } })).toMatchObject({ active: true, problems: ['This trigger is not configurable'] });
    });

    it('reads every from the config when it is a function, and an invalid answer stops only that trigger', () => {
        const perPlan = { every: (c) => c.pollEvery, handler };
        expect(resolveTrigger('p', perPlan, { pollEvery: '15m' })).toMatchObject({ tickMinutes: 5, cadence: 3, active: true });
        expect(resolveTrigger('p', perPlan, { pollEvery: 'sometimes' })).toMatchObject({ active: false, inactive: 'invalid' });
    });
});

describe('the due check', () => {
    const at = (iso) => Date.parse(iso);

    it('every: each installation is due exactly once per cadence, spread by its id', () => {
        const r = resolveTrigger('poll', { every: '1h', tick: '15m', handler }, {});
        expect(r.cadence).toBe(4);
        const ids = Array.from({ length: 200 }, (_, i) => `int-${i}`);
        const base = at('2026-10-19T12:00:00Z');
        const dueAt = Object.fromEntries(ids.map((id) => [id, []]));
        for (let k = 0; k < 8; k += 1) {
            for (const id of ids) if (dueRun(r, { integrationId: id, slotMs: base + k * 15 * MIN })) dueAt[id].push(k);
        }
        for (const id of ids) {
            expect(dueAt[id]).toHaveLength(2);                 // two cadences in eight ticks
            expect(dueAt[id][1] - dueAt[id][0]).toBe(4);      // exactly one cadence apart
        }
        // and spread: every one of the four slots of a cadence gets some installations
        expect(new Set(ids.map((id) => dueAt[id][0])).size).toBe(4);
        const first = ids.find((id) => dueAt[id][0] === 0);
        expect(dueRun(r, { integrationId: first, slotMs: base })).toEqual({ scheduledFor: '2026-10-19T12:00:00.000Z' });
    });

    it('cron: due on the tick whose window holds a firing, with that firing as scheduledFor', () => {
        const r = resolveTrigger('digest', { cron: '0 8 * * 1-5', timezone: 'America/New_York', tick: '5m', handler }, {});
        expect(dueRun(r, { integrationId: 'a', slotMs: at('2026-10-19T12:00:00Z') })).toEqual({ scheduledFor: '2026-10-19T12:00:00.000Z' });
        expect(dueRun(r, { integrationId: 'a', slotMs: at('2026-10-19T12:05:00Z') })).toBeNull();
        expect(dueRun(r, { integrationId: 'a', slotMs: at('2026-10-19T11:55:00Z') })).toBeNull();
        const late = resolveTrigger('d', { cron: '3 8 * * 1-5', timezone: 'America/New_York', tick: '5m', handler }, {});
        expect(dueRun(late, { integrationId: 'a', slotMs: at('2026-10-19T12:05:00Z') })).toEqual({ scheduledFor: '2026-10-19T12:03:00.000Z' });
    });

    it('at: always due when its own schedule runs; inactive triggers never', () => {
        const r = resolveTrigger('nightly', { at: 'cron(0 3 * * ? *)', handler }, {});
        expect(dueRun(r, { integrationId: 'a', slotMs: at('2026-10-19T03:00:41Z') })).toEqual({ scheduledFor: '2026-10-19T03:00:00.000Z' });
        const off = resolveTrigger('g', { every: '15m', when: () => false, handler }, {});
        expect(dueRun(off, { integrationId: 'a', slotMs: 0 })).toBeNull();
    });

    it('slots and hashes are stable, so the same tick delivered twice decides the same', () => {
        expect(slotStart(at('2026-10-19T12:04:59Z'), 5)).toBe(at('2026-10-19T12:00:00Z'));
        expect(slotStart(at('2026-10-19T12:05:00Z'), 5)).toBe(at('2026-10-19T12:05:00Z'));
        expect(hashId('abc')).toBe(hashId('abc'));
        expect(hashId('abc')).not.toBe(hashId('abd'));
        expect(hashId(42)).toBe(hashId('42'));
    });
});
