/**
 * The host-neutral recurrence behind recurring triggers (ADR-055 + its ADR-063 amendment): what an interval or a
 * five-field cron does, the floor an installation's choice is held to, and whether a cron fired between two ticks.
 */
const {
    parseEvery,
    minGapMinutes,
    validateRecurrence,
    recurrenceKey,
    lastFiringIn,
    wallClock,
} = require('../recurrence');

describe('recurrence (host-neutral)', () => {
    it('reads every as minutes, hours or days and nothing else', () => {
        expect([parseEvery('15m'), parseEvery('2h'), parseEvery('1d'), parseEvery(' 90 m ')]).toEqual([15, 120, 1440, 90]);
        for (const bad of ['30s', '0m', '1w', '', null, 'm15', '1.5h']) expect(parseEvery(bad)).toBeNull();
    });

    it('measures the shortest real gap of a cron, including the wrap into the next hour and day', () => {
        expect(minGapMinutes({ cron: '*/15 * * * *' })).toBe(15);
        expect(minGapMinutes({ cron: '*/7 * * * *' })).toBe(4);         // :56 -> :00
        expect(minGapMinutes({ cron: '5,50 * * * *' })).toBe(15);       // :50 -> :05
        expect(minGapMinutes({ cron: '0 */2 * * *' })).toBe(120);
        expect(minGapMinutes({ cron: '0 9 * * 1-5' })).toBe(1440);
        expect(minGapMinutes({ cron: '0 23,1 * * *' })).toBe(120);      // 23:00 -> 01:00 next day
        expect(minGapMinutes({ cron: '0 0 * * 0,7' })).toBe(10080);    // 0 and 7 are both Sunday
        expect(minGapMinutes({ every: '45m' })).toBe(45);
    });

    it('refuses what no host can run: bad fields, both day fields, a cron that never fires, an unknown time zone', () => {
        expect(validateRecurrence({ cron: '0 9 * *' })).toEqual([expect.stringMatching(/five fields/)]);
        expect(validateRecurrence({ cron: '60 * * * *' })).toEqual([expect.stringMatching(/minute.*out of range/)]);
        expect(validateRecurrence({ cron: '0 9 1 * MON' })).toEqual(['Restrict day of month or day of week, not both']);
        expect(validateRecurrence({ cron: '0 9 31 2 *' })).toEqual(['"0 9 31 2 *" never fires']);
        expect(validateRecurrence({ cron: '0 9 * * *', timezone: 'Mars/Base' })).toEqual(['Unknown time zone "Mars/Base"']);
        expect(validateRecurrence({ every: '1h', timezone: 'UTC' })).toEqual(['timezone applies to cron schedules only']);
        expect(validateRecurrence({ every: '1h', cron: '0 * * * *' })).toEqual(['Give exactly one of every or cron']);
        expect(validateRecurrence({ cron: '0 9 * * 1-5', timezone: 'America/New_York' })).toEqual([]);
    });

    it('holds a schedule to a floor by what it does, not how it is spelled', () => {
        expect(validateRecurrence({ every: '10m' }, { min: '15m' })).toEqual(['Runs every 10 minutes at its most frequent; the minimum is 15m']);
        expect(validateRecurrence({ cron: '0,5 * * * *' }, { min: '15m' })).toEqual(['Runs every 5 minutes at its most frequent; the minimum is 15m']);
        expect(validateRecurrence({ cron: '*/15 * * * *' }, { min: '15m' })).toEqual([]);
        expect(validateRecurrence({ every: '1h' }, { min: '1h' })).toEqual([]);
    });

    it('gives equal recurrences equal keys', () => {
        expect(recurrenceKey({ every: '60m' })).toBe(recurrenceKey({ every: '1h' }));
        expect(recurrenceKey({ cron: '0  9 * * *' })).toBe(recurrenceKey({ cron: '0 9 * * *', timezone: 'UTC' }));
        expect(recurrenceKey({ cron: '0 9 * * *', timezone: 'Europe/London' })).not.toBe(recurrenceKey({ cron: '0 9 * * *' }));
    });
});

describe('lastFiringIn: did a cron fire since the previous tick', () => {
    const at = (iso) => Date.parse(iso);
    const iso = (ms) => (ms === null ? null : new Date(ms).toISOString());
    const NY = { cron: '0 8 * * 1-5', timezone: 'America/New_York' };

    it('finds a firing in (from, to] in the cron\'s time zone, and only there', () => {
        // Monday 2026-10-19 08:00 in New York is 12:00Z (EDT).
        expect(iso(lastFiringIn(NY, at('2026-10-19T11:55:00Z'), at('2026-10-19T12:00:00Z')))).toBe('2026-10-19T12:00:00.000Z');
        expect(lastFiringIn(NY, at('2026-10-19T12:00:00Z'), at('2026-10-19T12:05:00Z'))).toBeNull();   // from is exclusive
        expect(lastFiringIn(NY, at('2026-10-19T07:55:00Z'), at('2026-10-19T08:00:00Z'))).toBeNull();   // 08:00 UTC is not 08:00 NY
        expect(lastFiringIn({ cron: '0 8 * * 1-5' }, at('2026-10-19T07:55:00Z'), at('2026-10-19T08:00:00Z'))).toBe(at('2026-10-19T08:00:00Z'));
        expect(lastFiringIn(NY, at('2026-10-18T11:55:00Z'), at('2026-10-18T12:00:00Z'))).toBeNull();   // Sunday
    });

    it('returns the latest firing when several fall in one window, so a tick names one run', () => {
        expect(iso(lastFiringIn({ cron: '*/2 * * * *' }, at('2026-10-19T12:00:00Z'), at('2026-10-19T12:05:30Z')))).toBe('2026-10-19T12:04:00.000Z');
    });

    it('walks real instants across DST: a skipped wall-clock time does not fire, a repeated one fires twice', () => {
        const twoThirty = { cron: '30 2 * * *', timezone: 'America/New_York' };
        // 2026-03-08: 02:00 EST jumps to 03:00 EDT, so 02:30 never happens.
        expect(lastFiringIn(twoThirty, at('2026-03-08T06:00:00Z'), at('2026-03-08T08:00:00Z'))).toBeNull();
        // 2026-11-01: 01:30 happens at 05:30Z (EDT) and again at 06:30Z (EST).
        const oneThirty = { cron: '30 1 * * *', timezone: 'America/New_York' };
        expect(iso(lastFiringIn(oneThirty, at('2026-11-01T05:00:00Z'), at('2026-11-01T06:00:00Z')))).toBe('2026-11-01T05:30:00.000Z');
        expect(iso(lastFiringIn(oneThirty, at('2026-11-01T06:00:00Z'), at('2026-11-01T07:00:00Z')))).toBe('2026-11-01T06:30:00.000Z');
    });

    it('reads a wall clock in a zone into UTC fields, and an invalid cron as never firing', () => {
        expect(wallClock(at('2026-10-19T12:34:56Z'), 'Asia/Kolkata').toISOString()).toBe('2026-10-19T18:04:00.000Z');
        expect(lastFiringIn({ cron: 'nope' }, 0, Date.now())).toBeNull();
    });
});
